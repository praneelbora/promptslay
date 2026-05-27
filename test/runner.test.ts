import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSuite } from '../src/core/runner.js';
import type { EvalSuite } from '../src/core/types.js';
import { MockProvider } from '../src/providers/mock.js';

const baseSuite: EvalSuite = {
  name: 'greeting-suite',
  provider: 'mock',
  model: 'claude-haiku-4-5',
  prompt: { user: 'Greet {{name}} politely.' },
  cases: [
    {
      id: 'ada',
      vars: { name: 'Ada' },
      assertions: [{ type: 'contains', value: 'Ada' }],
    },
    {
      id: 'linus',
      vars: { name: 'Linus' },
      assertions: [{ type: 'contains', value: 'Linus' }],
    },
  ],
};

describe('runSuite', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'promptslay-run-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const opts = (extra: Record<string, unknown> = {}) => ({
    cwd: dir,
    cacheDir: join(dir, 'cache'),
    baselineDir: join(dir, 'baselines'),
    providers: { mock: new MockProvider() },
    ...extra,
  });

  it('runs all cases and aggregates totals, cost and usage', async () => {
    const result = await runSuite(baseSuite, opts());
    expect(result.totals.cases).toBe(2);
    expect(result.totals.passed).toBe(2);
    expect(result.totals.failed).toBe(0);
    expect(result.totals.inputTokens).toBeGreaterThan(0);
    expect(result.cases.every((c) => c.latencyMs >= 0)).toBe(true);
  });

  it('fails cases whose assertions do not hold', async () => {
    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        { id: 'bad', vars: { name: 'Ada' }, assertions: [{ type: 'contains', value: 'Grace' }] },
      ],
    };
    const result = await runSuite(suite, opts());
    expect(result.totals.failed).toBe(1);
    expect(result.cases[0]?.grades[0]?.passed).toBe(false);
  });

  it('serves the second run from the response cache', async () => {
    const first = await runSuite(baseSuite, opts());
    expect(first.totals.cacheHits).toBe(0);

    const second = await runSuite(baseSuite, opts());
    expect(second.totals.cacheHits).toBe(2);
    expect(second.cases.every((c) => c.cached)).toBe(true);
  });

  it('detects regressions against the stored baseline and can update it', async () => {
    const stable = opts({ updateBaselines: true });
    await runSuite(baseSuite, stable);

    // Same outputs -> clean run.
    const clean = await runSuite(baseSuite, opts());
    expect(clean.totals.regressions).toBe(0);

    // A provider that answers differently -> regression with a diff.
    const drifted = await runSuite(
      baseSuite,
      opts({
        cache: false,
        providers: { mock: new MockProvider({ respond: () => 'Completely new answer' }) },
      }),
    );
    expect(drifted.totals.regressions).toBe(2);
    expect(drifted.cases[0]?.regression?.diff).toContain('+Completely new answer');

    // Accepting the new outputs clears the regression.
    await runSuite(
      baseSuite,
      opts({
        cache: false,
        updateBaselines: true,
        providers: { mock: new MockProvider({ respond: () => 'Completely new answer' }) },
      }),
    );
    const accepted = await runSuite(
      baseSuite,
      opts({
        cache: false,
        providers: { mock: new MockProvider({ respond: () => 'Completely new answer' }) },
      }),
    );
    expect(accepted.totals.regressions).toBe(0);
  });

  it('retries transient provider failures', async () => {
    const flaky = new MockProvider({ failTimes: 1 });
    const result = await runSuite(
      { ...baseSuite, cases: [baseSuite.cases![0]!] },
      opts({
        providers: { mock: flaky },
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      }),
    );
    expect(result.totals.errors).toBe(0);
    expect(result.totals.passed).toBe(1);
    expect(flaky.calls.length).toBe(2); // 1 failure + 1 success
  });

  it('honours only/skip markers', async () => {
    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        { id: 'a', vars: { name: 'A' }, only: true, assertions: [{ type: 'contains', value: 'A' }] },
        { id: 'b', vars: { name: 'B' }, assertions: [{ type: 'contains', value: 'B' }] },
      ],
    };
    const result = await runSuite(suite, opts());
    expect(result.totals.cases).toBe(1);
    expect(result.cases[0]?.caseId).toBe('a');
  });

  it('respects the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const provider = new MockProvider({
      respond: () => 'ok',
    });
    const original = provider.generate.bind(provider);
    provider.generate = async (prompt, options) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      const result = await original(prompt, options);
      inFlight -= 1;
      return result;
    };

    const suite: EvalSuite = {
      ...baseSuite,
      assertions: [{ type: 'contains', value: 'ok' }],
      cases: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, vars: { name: `N${i}` } })),
    };
    const result = await runSuite(suite, opts({ providers: { mock: provider }, concurrency: 2, cache: false }));
    expect(result.totals.cases).toBe(8);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
