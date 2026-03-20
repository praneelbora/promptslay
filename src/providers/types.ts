import type { ModelParams, RenderedPrompt, TokenUsage } from '../core/types.js';

/** Options for a single generation. */
export interface GenerateOptions {
  model: string;
  params?: ModelParams;
}

/** Result of a single generation. */
export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
  /** Estimated cost in USD based on the per-model pricing table. */
  costUsd: number;
  /** The model that actually served the request. */
  model: string;
}

/**
 * The provider adapter contract. Implement this to plug any LLM backend into
 * promptslay — the runner, cache, cost tracking and reporters only ever talk
 * to this interface.
 *
 * Implementations should throw on transport errors; the runner wraps calls in
 * retry-with-backoff for transient failures (429/5xx/connection resets).
 */
export interface ProviderAdapter {
  /** Stable name, used in cache keys and reports (e.g. "anthropic"). */
  readonly name: string;
  generate(prompt: RenderedPrompt, options: GenerateOptions): Promise<GenerateResult>;
}
