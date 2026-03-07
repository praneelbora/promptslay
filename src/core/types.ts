/**
 * Core types shared across the runner, graders, providers and reporters.
 */

/** A prompt template. `{{variable}}` placeholders are filled per case. */
export interface PromptTemplate {
  /** Optional system prompt. Supports templating. */
  system?: string;
  /** User message. Supports templating. */
  user: string;
}

/** A prompt after variable substitution. */
export interface RenderedPrompt {
  system?: string;
  user: string;
}

/** Token usage for a single generation. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Sampling / generation parameters forwarded to the provider. */
export interface ModelParams {
  /** Max output tokens. Defaults to 1024. */
  maxTokens?: number;
  /** Sampling temperature. Omit for provider default (some models reject it). */
  temperature?: number;
  /** Nucleus sampling. Mutually exclusive with temperature on most models. */
  topP?: number;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export interface ExactAssertion {
  type: 'exact';
  /** Expected output. Falls back to the case's `expected` field when omitted. */
  value?: string;
  /** Compare case-sensitively. Default true. */
  caseSensitive?: boolean;
  /** Trim surrounding whitespace before comparing. Default true. */
  trim?: boolean;
}

export interface ContainsAssertion {
  type: 'contains';
  /** Substring(s) that must all appear in the output. */
  value: string | string[];
  /** Default true. */
  caseSensitive?: boolean;
}

export interface RegexAssertion {
  type: 'regex';
  pattern: string;
  flags?: string;
}

export interface JsonSchemaAssertion {
  type: 'json-schema';
  /** A JSON Schema the (parsed) output must validate against. */
  schema: Record<string, unknown>;
}

export interface SimilarityAssertion {
  type: 'similarity';
  /** Reference text. Falls back to the case's `expected` field when omitted. */
  value?: string;
  /** Minimum cosine similarity in [0, 1]. Default 0.8. */
  threshold?: number;
  /** Character n-gram size for the embedding-free fallback. Default 3. */
  ngram?: number;
}

/** One criterion of an LLM-judge rubric, scored 1–5 by the judge. */
export interface RubricCriterion {
  name: string;
  description: string;
  /** Relative weight when aggregating. Default 1. */
  weight?: number;
}

export interface LlmJudgeAssertion {
  type: 'llm-judge';
  rubric: RubricCriterion[];
  /** Judge model. Defaults to claude-opus-4-8 (claude-haiku-4-5 with `quick`). */
  judgeModel?: string;
  /** Minimum normalized weighted score in [0, 1]. Default 0.7. */
  threshold?: number;
  /** Use the cheap/fast judge tier. Ignored when judgeModel is set. */
  quick?: boolean;
}

export type Assertion =
  | ExactAssertion
  | ContainsAssertion
  | RegexAssertion
  | JsonSchemaAssertion
  | SimilarityAssertion
  | LlmJudgeAssertion;

export type AssertionType = Assertion['type'];

// ---------------------------------------------------------------------------
// Suites and cases
// ---------------------------------------------------------------------------

/** A single eval case: variables for the prompt plus assertions on the output. */
export interface EvalCase {
  id: string;
  /** Variables substituted into the prompt template. */
  vars?: Record<string, unknown>;
  /**
   * Expected output. Used by `exact`/`similarity` assertions that omit
   * `value`, and as an implicit exact assertion when no assertions are given.
   */
  expected?: string;
  /** Case-level assertions, evaluated in addition to suite-level ones. */
  assertions?: Assertion[];
  /** Run only cases marked `only` when at least one is present. */
  only?: boolean;
  skip?: boolean;
}

/** An eval suite — "a test file for a prompt". */
export interface EvalSuite {
  name: string;
  description?: string;
  /** Provider adapter name. Default "anthropic". */
  provider?: string;
  /** Model id. Default claude-opus-4-8. */
  model?: string;
  prompt: PromptTemplate;
  params?: ModelParams;
  /** Inline cases. Merged with `dataset` cases when both are present. */
  cases?: EvalCase[];
  /** Path to a JSONL file with one case per line. */
  dataset?: string;
  /** Suite-wide assertions applied to every case. */
  assertions?: Assertion[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Outcome of a single assertion. */
export interface GradeResult {
  /** Assertion type that produced this grade. */
  grader: AssertionType;
  passed: boolean;
  /** Normalized score in [0, 1]. Deterministic graders report 0 or 1. */
  score: number;
  /** Human-readable explanation, mostly for failures. */
  message?: string;
  /** Grader-specific payload (e.g. the judge's structured verdict). */
  details?: unknown;
  /** Extra spend incurred by the grader itself (LLM judge calls). */
  costUsd?: number;
}

/** Drift against the stored baseline for one case. */
export interface RegressionInfo {
  caseId: string;
  /** Unified diff of baseline output vs current output. */
  diff: string;
  /** Model that produced the baseline output. */
  baselineModel: string;
  /** True when the rendered prompt (or model) changed since the baseline. */
  promptChanged: boolean;
}

export interface CaseResult {
  caseId: string;
  passed: boolean;
  output: string;
  grades: GradeResult[];
  usage: TokenUsage;
  /** Generation cost plus any judge cost. */
  costUsd: number;
  latencyMs: number;
  /** True when the generation was served from the response cache. */
  cached: boolean;
  regression?: RegressionInfo;
  error?: string;
}

export interface RunTotals {
  cases: number;
  passed: number;
  failed: number;
  errors: number;
  regressions: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  cacheHits: number;
}

export interface RunResult {
  suite: string;
  provider: string;
  model: string;
  startedAt: string;
  durationMs: number;
  cases: CaseResult[];
  totals: RunTotals;
  /** True when this run rewrote the stored baselines. */
  baselineUpdated: boolean;
}
