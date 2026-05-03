import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';

import { cacheKey, ResponseCache, stableStringify } from '../cache/disk-cache.js';
import { loadJsonlCases } from '../config/jsonl.js';
import { grade } from '../graders/index.js';
import type { EmbeddingProvider, GraderContext } from '../graders/types.js';
import { resolveProvider } from '../providers/index.js';
import type { GenerateResult, ProviderAdapter } from '../providers/types.js';
import { BaselineStore } from '../snapshot/baseline.js';
import type { Baseline } from '../snapshot/baseline.js';
import { DEFAULT_CONCURRENCY, DEFAULT_MODEL, PROMPTSLAY_DIR } from './constants.js';
import { mapWithConcurrency } from './pool.js';
import { withRetry } from './retry.js';
import type { RetryOptions } from './retry.js';
import { validateSuite } from './suite.js';
import { renderPrompt } from './template.js';
import type {
  Assertion,
  CaseResult,
  EvalCase,
  EvalSuite,
  GradeResult,
  RunResult,
  RunTotals,
} from './types.js';

export interface RunOptions {
  /** Cases evaluated in parallel. Default 4. */
  concurrency?: number;
  /** Read/write the disk response cache. Default true. */
  cache?: boolean;
  /** Default `<cwd>/.promptslay/cache`. */
  cacheDir?: string;
  /** Default `<cwd>/.promptslay/baselines`. */
  baselineDir?: string;
  /** Rewrite baselines from this run instead of reporting regressions. */
  updateBaselines?: boolean;
  /** Provider overrides by name — wins over the global registry. */
  providers?: Record<string, ProviderAdapter>;
  /** Provider used for llm-judge assertions. Default: Anthropic adapter. */
  judgeProvider?: ProviderAdapter;
  /** Embedding backend for similarity assertions (optional). */
  embeddings?: EmbeddingProvider;
  /** Retry tuning for provider calls. */
  retry?: RetryOptions;
  /** Base directory for datasets, cache and baselines. Default process.cwd(). */
  cwd?: string;
  /** Progress callback, fired as each case settles. */
  onCaseComplete?: (result: CaseResult) => void;
}

interface CaseRunContext {
  suite: EvalSuite;
  provider: ProviderAdapter;
  model: string;
  cache?: ResponseCache;
  baseline?: Baseline;
  store: BaselineStore;
  options: RunOptions;
}

function collectAssertions(suite: EvalSuite, evalCase: EvalCase): Assertion[] {
  const assertions = [...(evalCase.assertions ?? []), ...(suite.assertions ?? [])];
  if (assertions.length === 0 && evalCase.expected !== undefined) {
    // A bare `expected` is an implicit exact-match assertion.
    assertions.push({ type: 'exact' });
  }
  return assertions;
}

function promptHashFor(rendered: { system?: string; user: string }, model: string): string {
  return createHash('sha256')
    .update(stableStringify({ ...rendered, model }))
    .digest('hex');
}

async function runCase(evalCase: EvalCase, ctx: CaseRunContext): Promise<CaseResult> {
  const { suite, provider, model, cache, baseline, store, options } = ctx;
  try {
    const rendered = renderPrompt(suite.prompt, evalCase.vars);
    const promptHash = promptHashFor(rendered, model);
    const key = cacheKey({
      provider: provider.name,
      model,
      prompt: rendered,
      ...(suite.params !== undefined ? { params: suite.params } : {}),
    });

    let generation: GenerateResult | undefined;
    let cached = false;
    if (cache) {
      const hit = await cache.get(key);
      if (hit) {
        cached = true;
        generation = {
          text: hit.text,
          usage: hit.usage,
          costUsd: 0, // cache hits are free — the original cost was paid once
          latencyMs: 0,
          model: hit.model,
        };
      }
    }
    if (!generation) {
      generation = await withRetry(
        () =>
          provider.generate(rendered, {
            model,
            ...(suite.params !== undefined ? { params: suite.params } : {}),
          }),
        options.retry,
      );
      if (cache) {
        await cache.set(key, {
          text: generation.text,
          usage: generation.usage,
          costUsd: generation.costUsd,
          model: generation.model,
          latencyMs: generation.latencyMs,
          cachedAt: new Date().toISOString(),
        });
      }
    }

    const graderCtx: GraderContext = {
      output: generation.text,
      prompt: rendered,
      ...(evalCase.expected !== undefined ? { expected: evalCase.expected } : {}),
      ...(evalCase.vars !== undefined ? { vars: evalCase.vars } : {}),
      ...(options.judgeProvider !== undefined ? { judgeProvider: options.judgeProvider } : {}),
      ...(options.embeddings !== undefined ? { embeddings: options.embeddings } : {}),
    };

    const grades: GradeResult[] = [];
    for (const assertion of collectAssertions(suite, evalCase)) {
      grades.push(await grade(assertion, graderCtx));
    }

    const judgeCost = grades.reduce((sum, g) => sum + (g.costUsd ?? 0), 0);
    const regression = options.updateBaselines
      ? undefined
      : store.compare(baseline, evalCase.id, generation.text, promptHash);

    return {
      caseId: evalCase.id,
      passed: grades.every((g) => g.passed),
      output: generation.text,
      grades,
      usage: generation.usage,
      costUsd: generation.costUsd + judgeCost,
      latencyMs: generation.latencyMs,
      cached,
      ...(regression !== undefined ? { regression } : {}),
    };
  } catch (error) {
    return {
      caseId: evalCase.id,
      passed: false,
      output: '',
      grades: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      latencyMs: 0,
      cached: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function computeTotals(cases: CaseResult[], costUsd: number): RunTotals {
  const errors = cases.filter((c) => c.error !== undefined).length;
  const passed = cases.filter((c) => c.passed).length;
  const latencies = cases.filter((c) => c.error === undefined).map((c) => c.latencyMs);
  return {
    cases: cases.length,
    passed,
    failed: cases.length - passed - errors,
    errors,
    regressions: cases.filter((c) => c.regression !== undefined).length,
    costUsd,
    inputTokens: cases.reduce((sum, c) => sum + c.usage.inputTokens, 0),
    outputTokens: cases.reduce((sum, c) => sum + c.usage.outputTokens, 0),
    avgLatencyMs:
      latencies.length === 0 ? 0 : latencies.reduce((a, b) => a + b, 0) / latencies.length,
    cacheHits: cases.filter((c) => c.cached).length,
  };
}

/**
 * Run an eval suite end to end: render prompts, generate (with caching and
 * retries), grade, and compare against the stored baseline.
 */
export async function runSuite(suiteInput: EvalSuite, options: RunOptions = {}): Promise<RunResult> {
  const suite = validateSuite(suiteInput);
  const cwd = options.cwd ?? process.cwd();

  let cases: EvalCase[] = [...(suite.cases ?? [])];
  if (suite.dataset !== undefined) {
    const datasetPath = isAbsolute(suite.dataset) ? suite.dataset : resolve(cwd, suite.dataset);
    cases = [...cases, ...(await loadJsonlCases(datasetPath))];
  }
  if (cases.some((c) => c.only)) cases = cases.filter((c) => c.only);
  cases = cases.filter((c) => !c.skip);
  if (cases.length === 0) {
    throw new Error(`suite "${suite.name}" has no runnable cases`);
  }

  const provider = resolveProvider(suite.provider ?? 'anthropic', options.providers);
  const model = suite.model ?? DEFAULT_MODEL;
  const cache =
    (options.cache ?? true)
      ? new ResponseCache(options.cacheDir ?? join(cwd, PROMPTSLAY_DIR, 'cache'))
      : undefined;
  const store = new BaselineStore(options.baselineDir ?? join(cwd, PROMPTSLAY_DIR, 'baselines'));
  const baseline = await store.load(suite.name);

  const startedAt = new Date();
  const ctx: CaseRunContext = {
    suite,
    provider,
    model,
    ...(cache !== undefined ? { cache } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
    store,
    options,
  };

  const results = await mapWithConcurrency(
    cases,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async (evalCase) => {
      const result = await runCase(evalCase, ctx);
      options.onCaseComplete?.(result);
      return result;
    },
  );

  let baselineUpdated = false;
  if (options.updateBaselines) {
    const ok = results.filter((r) => r.error === undefined);
    if (ok.length > 0) {
      const outputs = ok.map((r) => {
        const evalCase = cases.find((c) => c.id === r.caseId) as EvalCase;
        const rendered = renderPrompt(suite.prompt, evalCase.vars);
        return {
          caseId: r.caseId,
          output: r.output,
          promptHash: promptHashFor(rendered, model),
          model,
        };
      });
      await store.save(store.next(baseline, suite.name, outputs));
      baselineUpdated = true;
    }
  }

  const costUsd = results.reduce((sum, r) => sum + r.costUsd, 0);
  return {
    suite: suite.name,
    provider: provider.name,
    model,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    cases: results,
    totals: computeTotals(results, costUsd),
    baselineUpdated,
  };
}
