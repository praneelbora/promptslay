import { describe, expect, it } from 'vitest';

import { estimateCostUsd, PRICING, pricingFor } from '../src/providers/pricing.js';

describe('pricingFor', () => {
  it('matches model aliases exactly', () => {
    expect(pricingFor('claude-opus-4-8')).toEqual({ inputPerMTok: 5, outputPerMTok: 25 });
    expect(pricingFor('claude-haiku-4-5')).toEqual({ inputPerMTok: 1, outputPerMTok: 5 });
  });

  it('falls back to alias for date-suffixed ids', () => {
    expect(pricingFor('claude-haiku-4-5-20251001')).toEqual(PRICING['claude-haiku-4-5']);
  });

  it('returns undefined for unknown models', () => {
    expect(pricingFor('gpt-oss-1b')).toBeUndefined();
  });
});

describe('estimateCostUsd', () => {
  it('computes opus 4.8 cost at $5/$25 per MTok', () => {
    const cost = estimateCostUsd('claude-opus-4-8', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(30);
  });

  it('computes haiku 4.5 cost at $1/$5 per MTok', () => {
    const cost = estimateCostUsd('claude-haiku-4-5', {
      inputTokens: 2_000_000,
      outputTokens: 400_000,
    });
    expect(cost).toBeCloseTo(2 + 2);
  });

  it('scales linearly for small usage', () => {
    const cost = estimateCostUsd('claude-opus-4-8', { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeCloseTo(0.005 + 0.0125);
  });

  it('reports zero for unknown models instead of guessing', () => {
    expect(estimateCostUsd('some-local-model', { inputTokens: 1e6, outputTokens: 1e6 })).toBe(0);
  });

  it('reports zero for zero usage', () => {
    expect(estimateCostUsd('claude-opus-4-8', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
