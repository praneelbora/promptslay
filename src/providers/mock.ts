import type { RenderedPrompt } from '../core/types.js';
import { estimateCostUsd } from './pricing.js';
import type { GenerateOptions, GenerateResult, ProviderAdapter } from './types.js';

/** Rough token estimate used by the mock provider (≈4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface MockResponseRule {
  /** Substring or regex matched against the rendered user prompt. */
  match: string | RegExp;
  reply: string;
}

export interface MockProviderOptions {
  /** Full control: compute the reply from the rendered prompt. */
  respond?: (prompt: RenderedPrompt, options: GenerateOptions) => string;
  /** First matching rule wins. Checked before the echo fallback. */
  rules?: MockResponseRule[];
  /** Deterministic fake latency. Default 1ms. */
  latencyMs?: number;
  /** Throw a retryable (status 529) error for the first N calls. */
  failTimes?: number;
}

/**
 * A deterministic, offline provider. Used by the test-suite and by example
 * suites so they run without an API key. By default it echoes the rendered
 * user prompt (`echo: …`), which makes contains/regex assertions easy to
 * write against prompt variables.
 */
export class MockProvider implements ProviderAdapter {
  readonly name = 'mock';
  /** Every generate() invocation, in order. Handy for assertions in tests. */
  readonly calls: Array<{ prompt: RenderedPrompt; options: GenerateOptions }> = [];

  private failuresLeft: number;

  constructor(private readonly options: MockProviderOptions = {}) {
    this.failuresLeft = options.failTimes ?? 0;
  }

  async generate(prompt: RenderedPrompt, options: GenerateOptions): Promise<GenerateResult> {
    this.calls.push({ prompt, options });

    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      const error = new Error('mock transient failure') as Error & { status: number };
      error.status = 529;
      throw error;
    }

    const text = this.reply(prompt, options);
    const usage = {
      inputTokens: estimateTokens(`${prompt.system ?? ''}${prompt.user}`),
      outputTokens: estimateTokens(text),
    };

    return {
      text,
      usage,
      latencyMs: this.options.latencyMs ?? 1,
      costUsd: estimateCostUsd(options.model, usage),
      model: options.model,
    };
  }

  private reply(prompt: RenderedPrompt, options: GenerateOptions): string {
    if (this.options.respond) return this.options.respond(prompt, options);
    for (const rule of this.options.rules ?? []) {
      const matched =
        typeof rule.match === 'string'
          ? prompt.user.includes(rule.match)
          : rule.match.test(prompt.user);
      if (matched) return rule.reply;
    }
    return `echo: ${prompt.user}`;
  }
}
