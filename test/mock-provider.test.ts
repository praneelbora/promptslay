import { describe, expect, it } from 'vitest';

import { estimateTokens, MockProvider } from '../src/providers/mock.js';

describe('MockProvider', () => {
  it('echoes the user prompt by default', async () => {
    const provider = new MockProvider();
    const result = await provider.generate({ user: 'hello' }, { model: 'claude-haiku-4-5' });
    expect(result.text).toBe('echo: hello');
    expect(result.model).toBe('claude-haiku-4-5');
  });

  it('is deterministic', async () => {
    const provider = new MockProvider();
    const a = await provider.generate({ user: 'same' }, { model: 'claude-haiku-4-5' });
    const b = await provider.generate({ user: 'same' }, { model: 'claude-haiku-4-5' });
    expect(a).toEqual(b);
  });

  it('matches rules by substring and regex', async () => {
    const provider = new MockProvider({
      rules: [
        { match: 'weather', reply: 'Sunny, 22°C.' },
        { match: /refund/i, reply: 'Refund initiated.' },
      ],
    });
    expect((await provider.generate({ user: 'weather in Paris?' }, { model: 'm' })).text).toBe(
      'Sunny, 22°C.',
    );
    expect((await provider.generate({ user: 'Please REFUND me' }, { model: 'm' })).text).toBe(
      'Refund initiated.',
    );
    expect((await provider.generate({ user: 'other' }, { model: 'm' })).text).toBe('echo: other');
  });

  it('supports a respond function', async () => {
    const provider = new MockProvider({ respond: (p) => p.user.toUpperCase() });
    expect((await provider.generate({ user: 'shout' }, { model: 'm' })).text).toBe('SHOUT');
  });

  it('estimates usage and cost from the pricing table', async () => {
    const provider = new MockProvider({ respond: () => 'x'.repeat(400) });
    const result = await provider.generate({ user: 'y'.repeat(40) }, { model: 'claude-haiku-4-5' });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 100 });
    expect(result.costUsd).toBeCloseTo((10 / 1e6) * 1 + (100 / 1e6) * 5);
  });

  it('records calls for assertions', async () => {
    const provider = new MockProvider();
    await provider.generate({ user: 'one' }, { model: 'm' });
    await provider.generate({ user: 'two' }, { model: 'm' });
    expect(provider.calls.map((c) => c.prompt.user)).toEqual(['one', 'two']);
  });

  it('throws retryable errors for the first failTimes calls', async () => {
    const provider = new MockProvider({ failTimes: 2 });
    await expect(provider.generate({ user: 'a' }, { model: 'm' })).rejects.toMatchObject({
      status: 529,
    });
    await expect(provider.generate({ user: 'a' }, { model: 'm' })).rejects.toThrow();
    await expect(provider.generate({ user: 'a' }, { model: 'm' })).resolves.toMatchObject({
      text: 'echo: a',
    });
  });
});

describe('estimateTokens', () => {
  it('approximates 4 characters per token, rounding up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
