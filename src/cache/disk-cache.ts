import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ModelParams, RenderedPrompt, TokenUsage } from '../core/types.js';

/** JSON.stringify with recursively sorted object keys, for stable hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

export interface CacheKeyInput {
  provider: string;
  model: string;
  prompt: RenderedPrompt;
  params?: ModelParams;
}

/** Deterministic cache key over (provider, model, prompt, params). */
export function cacheKey(input: CacheKeyInput): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

/** What we persist per cache entry. */
export interface CachedGeneration {
  text: string;
  usage: TokenUsage;
  costUsd: number;
  model: string;
  /** Latency of the original (uncached) call. */
  latencyMs: number;
  cachedAt: string;
}

/**
 * A tiny content-addressed cache on disk. Entries live under
 * `<dir>/<key[0..2]>/<key>.json` and never expire — eval inputs are
 * content-hashed, so stale entries simply stop being addressed.
 */
export class ResponseCache {
  constructor(private readonly dir: string) {}

  private fileFor(key: string): string {
    return join(this.dir, key.slice(0, 2), `${key}.json`);
  }

  async get(key: string): Promise<CachedGeneration | undefined> {
    try {
      const raw = await readFile(this.fileFor(key), 'utf8');
      return JSON.parse(raw) as CachedGeneration;
    } catch {
      // Missing or corrupt entries are treated as cache misses.
      return undefined;
    }
  }

  async set(key: string, value: CachedGeneration): Promise<void> {
    const file = this.fileFor(key);
    await mkdir(dirname(file), { recursive: true });
    // Write-then-rename so concurrent runs never observe partial JSON.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await rename(tmp, file);
  }
}
