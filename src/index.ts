/**
 * promptslay — unit tests for your prompts.
 *
 * Public API surface. Anything not exported here is internal and may change
 * without notice.
 */

// Core
export {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  FAST_MODEL,
  PROMPTSLAY_DIR,
} from './core/constants.js';
export { mapWithConcurrency } from './core/pool.js';
export { isTransientError, withRetry } from './core/retry.js';
export type { RetryOptions } from './core/retry.js';
export { runSuite } from './core/runner.js';
export type { RunOptions } from './core/runner.js';
export { defineSuite, SuiteValidationError, validateSuite } from './core/suite.js';
export {
  extractVariables,
  MissingVariableError,
  renderPrompt,
  renderTemplate,
} from './core/template.js';
export type {
  Assertion,
  AssertionType,
  CaseResult,
  ContainsAssertion,
  EvalCase,
  EvalSuite,
  ExactAssertion,
  GradeResult,
  JsonSchemaAssertion,
  LlmJudgeAssertion,
  ModelParams,
  PromptTemplate,
  RegexAssertion,
  RegressionInfo,
  RenderedPrompt,
  RubricCriterion,
  RunResult,
  RunTotals,
  SimilarityAssertion,
  TokenUsage,
} from './core/types.js';

// Graders
export {
  aggregateVerdict,
  buildJudgePrompt,
  charNgrams,
  cosineDense,
  cosineSparse,
  extractJsonBlock,
  grade,
  gradeContains,
  gradeExact,
  gradeJsonSchema,
  gradeLlmJudge,
  gradeRegex,
  gradeSimilarity,
  ngramSimilarity,
} from './graders/index.js';
export type {
  EmbeddingProvider,
  GraderContext,
  JudgeCriterionScore,
  JudgeVerdict,
} from './graders/index.js';

// Providers
export {
  AnthropicProvider,
  estimateCostUsd,
  estimateTokens,
  MockProvider,
  PRICING,
  pricingFor,
  registerProvider,
  resolveProvider,
} from './providers/index.js';
export type {
  AnthropicProviderOptions,
  GenerateOptions,
  GenerateResult,
  MockProviderOptions,
  MockResponseRule,
  ModelPricing,
  ProviderAdapter,
} from './providers/index.js';

// Cache
export { cacheKey, ResponseCache, stableStringify } from './cache/disk-cache.js';
export type { CachedGeneration, CacheKeyInput } from './cache/disk-cache.js';

// Snapshots / regression
export { BaselineStore, renderUnifiedDiff, slugify } from './snapshot/baseline.js';
export type { Baseline, BaselineEntry } from './snapshot/baseline.js';

// Config loading
export { loadSuite } from './config/load.js';
export { loadJsonlCases } from './config/jsonl.js';
export { loadSuiteFromYaml } from './config/yaml.js';

// Reporting
export { renderConsoleReport } from './report/console.js';
export type { ConsoleReportOptions } from './report/console.js';
export { escapeHtml, renderHtmlReport, writeHtmlReport } from './report/html.js';

export { VERSION } from './version.js';
