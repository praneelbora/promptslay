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

  it('resolves every alias and its date-suffixed id to its own entry', () => {
    for (const [alias, pricing] of Object.entries(PRICING)) {
      expect(pricingFor(alias)).toBe(pricing);
      expect(pricingFor(`${alias}-20260101`)).toBe(pricing);
    }
  });

  it('prefers the longest matching alias', () => {
    PRICING['claude-test-9'] = { inputPerMTok: 1, outputPerMTok: 1 };
    PRICING['claude-test-9-1'] = { inputPerMTok: 2, outputPerMTok: 2 };
    try {
      expect(pricingFor('claude-test-9-1-20260101')).toBe(PRICING['claude-test-9-1']);
      expect(pricingFor('claude-test-9-20260101')).toBe(PRICING['claude-test-9']);
    } finally {
      delete PRICING['claude-test-9'];
      delete PRICING['claude-test-9-1'];
    }
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

  it.each([
    ['claude-fable-5-1', 10, 50],
    ['claude-opus-5-5', 4, 20],
    ['claude-sonnet-5-5', 2, 10],
    ['claude-haiku-5-5', 0.1, 0.5],
  ])('computes %s cost at $%d/$%d per MTok', (model, inputRate, outputRate) => {
    const cost = estimateCostUsd(model, { inputTokens: 2_000_000, outputTokens: 500_000 });
    expect(cost).toBeCloseTo(2 * inputRate + 0.5 * outputRate);
    expect(cost).toBeGreaterThan(0);
  });

  it('prices date-suffixed Claude 5 ids like their alias', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(estimateCostUsd('claude-opus-5-5-20260401', usage)).toBeCloseTo(24);
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
