import type { TokenUsage } from '../core/types.js';

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

/**
 * Per-model pricing, USD per million tokens. Aliases (e.g. claude-opus-4-8)
 * are matched first; date-suffixed ids fall back to their alias prefix.
 */
export const PRICING: Record<string, ModelPricing> = {
  'claude-fable-5-1': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  // Base rate (prompts up to 100K tokens); longer prompts are billed higher.
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-7': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

/** Look up pricing for a model id, tolerating date-suffixed ids. */
export function pricingFor(model: string): ModelPricing | undefined {
  const exact = PRICING[model];
  if (exact) return exact;
  // claude-haiku-4-5-20251001 -> claude-haiku-4-5. Longest alias wins so a
  // short alias (claude-opus-5) can never shadow a longer one (claude-opus-5-5).
  let best: string | undefined;
  for (const alias of Object.keys(PRICING)) {
    if (model.startsWith(`${alias}-`) && (!best || alias.length > best.length)) best = alias;
  }
  return best ? PRICING[best] : undefined;
}

/**
 * Estimate the USD cost of a generation. Unknown models cost 0 — better to
 * under-report than to invent numbers for models we don't know.
 */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const pricing = pricingFor(model);
  if (!pricing) return 0;
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMTok +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}
