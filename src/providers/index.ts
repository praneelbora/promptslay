import { AnthropicProvider } from './anthropic.js';
import { MockProvider } from './mock.js';
import type { ProviderAdapter } from './types.js';

export type ProviderFactory = () => ProviderAdapter;

const factories = new Map<string, ProviderFactory>([
  ['anthropic', () => new AnthropicProvider()],
  ['mock', () => new MockProvider()],
]);

/** Register a custom provider so YAML suites can reference it by name. */
export function registerProvider(name: string, factory: ProviderFactory): void {
  factories.set(name, factory);
}

/**
 * Resolve a provider by name. `overrides` (e.g. a pre-configured MockProvider
 * passed through RunOptions) win over the global registry.
 */
export function resolveProvider(
  name: string,
  overrides?: Record<string, ProviderAdapter>,
): ProviderAdapter {
  const override = overrides?.[name];
  if (override) return override;
  const factory = factories.get(name);
  if (!factory) {
    const known = [...factories.keys()].sort().join(', ');
    throw new Error(`Unknown provider "${name}". Registered providers: ${known}`);
  }
  return factory();
}

export { AnthropicProvider } from './anthropic.js';
export type { AnthropicProviderOptions } from './anthropic.js';
export { MockProvider, estimateTokens } from './mock.js';
export type { MockProviderOptions, MockResponseRule } from './mock.js';
export { PRICING, pricingFor, estimateCostUsd } from './pricing.js';
export type { ModelPricing } from './pricing.js';
export type { GenerateOptions, GenerateResult, ProviderAdapter } from './types.js';
