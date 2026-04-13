import { describe, expect, it } from 'vitest';

import {
  charNgrams,
  cosineDense,
  cosineSparse,
  gradeSimilarity,
  ngramSimilarity,
} from '../src/graders/similarity.js';
import type { EmbeddingProvider, GraderContext } from '../src/graders/types.js';

const ctx = (output: string, extra: Partial<GraderContext> = {}): GraderContext => ({
  output,
  prompt: { user: 'x' },
  ...extra,
});

describe('charNgrams', () => {
  it('counts character trigrams', () => {
    const vector = charNgrams('aaab');
    expect(vector.get('aaa')).toBe(1);
    expect(vector.get('aab')).toBe(1);
  });

  it('normalizes case and whitespace', () => {
    expect(charNgrams('Hello  World')).toEqual(charNgrams('hello world'));
  });

  it('handles strings shorter than n', () => {
    expect(charNgrams('hi')).toEqual(new Map([['hi', 1]]));
  });
});

describe('cosine', () => {
  it('identical texts score 1', () => {
    expect(ngramSimilarity('the quick brown fox', 'the quick brown fox')).toBeCloseTo(1);
  });

  it('disjoint texts score 0', () => {
    expect(ngramSimilarity('aaaa', 'zzzz')).toBe(0);
  });

  it('similar texts score in between', () => {
    const score = ngramSimilarity(
      'The capital of France is Paris.',
      'Paris is the capital of France.',
    );
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(1);
  });

  it('cosineSparse treats two empty vectors as identical', () => {
    expect(cosineSparse(new Map(), new Map())).toBe(1);
    expect(cosineSparse(new Map(), charNgrams('abc'))).toBe(0);
  });

  it('cosineDense computes vector cosine', () => {
    expect(cosineDense([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineDense([1, 0], [0, 1])).toBeCloseTo(0);
    expect(() => cosineDense([1], [1, 2])).toThrow(RangeError);
  });
});

describe('gradeSimilarity', () => {
  it('passes near-identical outputs with the default threshold', async () => {
    const result = await gradeSimilarity(
      { type: 'similarity', value: 'The cat sat on the mat.' },
      ctx('the cat sat on the mat'),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.8);
  });

  it('fails unrelated outputs', async () => {
    const result = await gradeSimilarity(
      { type: 'similarity', value: 'A summary of quarterly finances.' },
      ctx('Bananas are an excellent source of potassium.'),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/below threshold/);
  });

  it('honors a custom threshold', async () => {
    const result = await gradeSimilarity(
      { type: 'similarity', value: 'hello there world', threshold: 0.1 },
      ctx('hello world'),
    );
    expect(result.passed).toBe(true);
  });

  it('falls back to the case expected value', async () => {
    const result = await gradeSimilarity({ type: 'similarity' }, ctx('same text', { expected: 'same text' }));
    expect(result.passed).toBe(true);
  });

  it('uses the pluggable embedding provider when present', async () => {
    const calls: string[][] = [];
    const embeddings: EmbeddingProvider = {
      embed: async (texts) => {
        calls.push(texts);
        return texts.map(() => [1, 2, 3]); // identical vectors -> cosine 1
      },
    };
    const result = await gradeSimilarity(
      { type: 'similarity', value: 'totally different words' },
      ctx('zzzz', { embeddings }),
    );
    expect(calls).toHaveLength(1);
    expect(result.score).toBeCloseTo(1);
    expect(result.details).toMatchObject({ method: 'embeddings' });
  });
});
