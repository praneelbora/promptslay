import Anthropic from '@anthropic-ai/sdk';

import { DEFAULT_MAX_TOKENS } from '../core/constants.js';
import type { RenderedPrompt } from '../core/types.js';
import { estimateCostUsd } from './pricing.js';
import type { GenerateOptions, GenerateResult, ProviderAdapter } from './types.js';

export interface AnthropicProviderOptions {
  /**
   * Bring your own client (custom base URL, fetch, timeouts). When omitted, a
   * default client is created which reads ANTHROPIC_API_KEY from the
   * environment — keys are never accepted as plain strings here.
   */
  client?: Anthropic;
}

/**
 * The default provider: Anthropic's Messages API via the official SDK.
 *
 * The SDK performs its own retries for 429/5xx; the runner adds another
 * retry-with-backoff layer on top for anything that still escapes.
 */
export class AnthropicProvider implements ProviderAdapter {
  readonly name = 'anthropic';

  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = options.client ?? new Anthropic();
  }

  async generate(prompt: RenderedPrompt, options: GenerateOptions): Promise<GenerateResult> {
    const startedAt = performance.now();

    const message = await this.client.messages.create({
      model: options.model,
      max_tokens: options.params?.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(prompt.system !== undefined ? { system: prompt.system } : {}),
      ...(options.params?.temperature !== undefined
        ? { temperature: options.params.temperature }
        : {}),
      ...(options.params?.topP !== undefined ? { top_p: options.params.topP } : {}),
      messages: [{ role: 'user', content: prompt.user }],
    });

    const latencyMs = performance.now() - startedAt;
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    return {
      text,
      usage,
      latencyMs,
      costUsd: estimateCostUsd(message.model, usage),
      model: message.model,
    };
  }
}
