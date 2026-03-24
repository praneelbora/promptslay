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
  // claude-haiku-4-5-20251001 -> claude-haiku-4-5
  for (const [alias, pricing] of Object.entries(PRICING)) {
    if (model.startsWith(`${alias}-`)) return pricing;
  }
  return undefined;
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
