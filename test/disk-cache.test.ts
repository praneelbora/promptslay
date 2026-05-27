import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cacheKey, ResponseCache, stableStringify } from '../src/cache/disk-cache.js';

describe('stableStringify', () => {
  it('is independent of key insertion order', () => {
    expect(stableStringify({ b: 1, a: { y: 2, x: 3 } })).toBe(
      stableStringify({ a: { x: 3, y: 2 }, b: 1 }),
    );
  });
});

describe('cacheKey', () => {
  const base = {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    prompt: { user: 'Summarize: hello' },
  };

  it('is deterministic for identical inputs', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
  });

  it('changes when provider, model, prompt or params change', () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, provider: 'mock' })).not.toBe(k);
    expect(cacheKey({ ...base, model: 'claude-haiku-4-5' })).not.toBe(k);
    expect(cacheKey({ ...base, prompt: { user: 'other' } })).not.toBe(k);
    expect(cacheKey({ ...base, params: { maxTokens: 64 } })).not.toBe(k);
  });
});

describe('ResponseCache', () => {
  let dir: string;
  let cache: ResponseCache;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'promptslay-cache-'));
    cache = new ResponseCache(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('misses for unknown keys', async () => {
    expect(await cache.get('0'.repeat(64))).toBeUndefined();
  });

  it('round-trips entries', async () => {
    const key = cacheKey({
      provider: 'mock',
      model: 'claude-haiku-4-5',
      prompt: { user: 'hi' },
    });
    const entry = {
      text: 'hello there',
      usage: { inputTokens: 3, outputTokens: 4 },
      costUsd: 0.000123,
      model: 'claude-haiku-4-5',
      latencyMs: 87,
      cachedAt: new Date().toISOString(),
    };
    await cache.set(key, entry);
    expect(await cache.get(key)).toEqual(entry);
  });

  it('treats corrupt entries as misses', async () => {
    const key = 'ab'.padEnd(64, 'c');
    await mkdir(join(dir, key.slice(0, 2)), { recursive: true });
    await writeFile(join(dir, key.slice(0, 2), `${key}.json`), '{not json', 'utf8');
    expect(await cache.get(key)).toBeUndefined();
  });
});
