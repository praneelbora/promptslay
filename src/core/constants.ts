/** Default model for eval runs and for the LLM judge. */
export const DEFAULT_MODEL = 'claude-opus-4-8';

/** Cheap/fast tier — used for smoke runs and the judge's quick mode. */
export const FAST_MODEL = 'claude-haiku-4-5';

/** Default max output tokens per generation. */
export const DEFAULT_MAX_TOKENS = 1024;

/** Default number of cases evaluated in parallel. */
export const DEFAULT_CONCURRENCY = 4;

/** Directory (relative to cwd) where promptslay keeps its state. */
export const PROMPTSLAY_DIR = '.promptslay';
