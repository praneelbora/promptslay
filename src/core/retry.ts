export interface RetryOptions {
  /** Number of retries after the initial attempt. Default 2. */
  retries?: number;
  /** First backoff delay. Default 500ms. */
  baseDelayMs?: number;
  /** Backoff ceiling. Default 8000ms. */
  maxDelayMs?: number;
  /** Decide whether an error is worth retrying. Default: transient API errors. */
  isRetryable?: (error: unknown) => boolean;
  /** Observe retries (logging, metrics). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter source returning [0, 1). Injectable for tests. */
  random?: () => number;
}

const RETRYABLE_STATUS = new Set([408, 409, 429]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);

/** Heuristic for transient failures: 408/409/429/5xx and connection errors. */
export function isTransientError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const err = error as { status?: unknown; code?: unknown; name?: unknown };
  if (typeof err.status === 'number' && (RETRYABLE_STATUS.has(err.status) || err.status >= 500)) {
    return true;
  }
  if (typeof err.code === 'string' && RETRYABLE_CODES.has(err.code)) return true;
  // The Anthropic SDK throws APIConnectionError/APIConnectionTimeoutError
  // without a status code.
  if (typeof err.name === 'string' && err.name.startsWith('APIConnection')) return true;
  return false;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff and full
 * jitter: delay = min(maxDelay, base * 2^attempt) * (0.5 + random/2).
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const isRetryable = options.isRetryable ?? isTransientError;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = Math.round(exponential * (0.5 + random() / 2));
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
