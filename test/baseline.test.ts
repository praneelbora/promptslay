import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaselineStore, renderUnifiedDiff, slugify } from '../src/snapshot/baseline.js';

describe('slugify', () => {
  it('lowercases and dashes suite names', () => {
    expect(slugify('Support Bot — Greetings v2')).toBe('support-bot-greetings-v2');
  });

  it('falls back to "suite" for degenerate names', () => {
    expect(slugify('***')).toBe('suite');
  });
});

describe('renderUnifiedDiff', () => {
  it('produces a unified diff with baseline/current labels', () => {
    const diff = renderUnifiedDiff('greet-1', 'Hello Ada!', 'Hi Ada!');
    expect(diff).toContain('baseline/greet-1');
    expect(diff).toContain('current/greet-1');
    expect(diff).toContain('-Hello Ada!');
    expect(diff).toContain('+Hi Ada!');
  });

  it('handles multiline outputs without trailing newlines', () => {
    const diff = renderUnifiedDiff('m', 'line1\nline2', 'line1\nline2 changed');
    expect(diff).toContain('-line2');
    expect(diff).toContain('+line2 changed');
  });
});

describe('BaselineStore', () => {
  let dir: string;
  let store: BaselineStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'promptslay-baseline-'));
    store = new BaselineStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns undefined for suites without a stored baseline', async () => {
    expect(await store.load('never-ran')).toBeUndefined();
  });

  it('round-trips a baseline to disk', async () => {
    const baseline = store.next(undefined, 'My Suite', [
      { caseId: 'a', output: 'out-a', promptHash: 'h1', model: 'claude-opus-4-8' },
    ]);
    await store.save(baseline);

    const loaded = await store.load('My Suite');
    expect(loaded?.entries['a']?.output).toBe('out-a');
    expect(loaded?.suite).toBe('My Suite');
  });

  it('compare() flags drift with a diff and prompt-change detection', async () => {
    const baseline = store.next(undefined, 's', [
      { caseId: 'a', output: 'old output', promptHash: 'h1', model: 'claude-opus-4-8' },
    ]);

    // Same output -> no regression.
    expect(store.compare(baseline, 'a', 'old output', 'h1')).toBeUndefined();
    // No entry -> no regression (first run for this case).
    expect(store.compare(baseline, 'new-case', 'whatever', 'h1')).toBeUndefined();

    const drifted = store.compare(baseline, 'a', 'new output', 'h1');
    expect(drifted?.diff).toContain('-old output');
    expect(drifted?.diff).toContain('+new output');
    expect(drifted?.promptChanged).toBe(false);

    const promptDrift = store.compare(baseline, 'a', 'new output', 'h2');
    expect(promptDrift?.promptChanged).toBe(true);
  });

  it('next() preserves createdAt across updates', async () => {
    const first = store.next(undefined, 's', [
      { caseId: 'a', output: '1', promptHash: 'h', model: 'm' },
    ]);
    const second = store.next(first, 's', [
      { caseId: 'a', output: '2', promptHash: 'h', model: 'm' },
    ]);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.entries['a']?.output).toBe('2');
  });
});
