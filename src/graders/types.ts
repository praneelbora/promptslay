import type { RenderedPrompt } from '../core/types.js';
import type { ProviderAdapter } from '../providers/types.js';

/**
 * Pluggable embedding backend for the similarity grader. When absent, the
 * grader falls back to embedding-free character n-gram cosine similarity.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/** Everything a grader may need to judge one output. */
export interface GraderContext {
  /** The model's output text. */
  output: string;
  /** The case's `expected` field, if any. */
  expected?: string;
  /** The case's variables. */
  vars?: Record<string, unknown>;
  /** The rendered prompt that produced the output. */
  prompt: RenderedPrompt;
  /** Provider used for LLM-judge calls. Defaults to the Anthropic adapter. */
  judgeProvider?: ProviderAdapter;
  /** Optional embedding backend for the similarity grader. */
  embeddings?: EmbeddingProvider;
}
