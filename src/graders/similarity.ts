import type { GradeResult, SimilarityAssertion } from '../core/types.js';
import type { GraderContext } from './types.js';

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_NGRAM = 3;

/** Lowercase and collapse whitespace so formatting doesn't dominate. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Character n-gram frequency vector for a piece of text. */
export function charNgrams(text: string, n = DEFAULT_NGRAM): Map<string, number> {
  const normalized = normalize(text);
  const vector = new Map<string, number>();
  if (normalized.length === 0) return vector;
  if (normalized.length < n) {
    vector.set(normalized, 1);
    return vector;
  }
  for (let i = 0; i <= normalized.length - n; i += 1) {
    const gram = normalized.slice(i, i + n);
    vector.set(gram, (vector.get(gram) ?? 0) + 1);
  }
  return vector;
}

export function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return a.size === b.size ? 1 : 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [gram, weight] of small) {
    const other = large.get(gram);
    if (other !== undefined) dot += weight * other;
  }
  const magnitude = (v: Map<string, number>) =>
    Math.sqrt([...v.values()].reduce((sum, w) => sum + w * w, 0));
  return dot / (magnitude(a) * magnitude(b));
}

export function cosineDense(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(`embedding dimensions differ (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Embedding-free similarity: cosine over character n-gram vectors. */
export function ngramSimilarity(a: string, b: string, n = DEFAULT_NGRAM): number {
  return cosineSparse(charNgrams(a, n), charNgrams(b, n));
}

/**
 * Semantic-ish similarity grader. Uses the pluggable embedding provider when
 * one is configured, otherwise falls back to character n-gram cosine — crude,
 * but deterministic, offline and surprisingly effective for paraphrase checks.
 */
export async function gradeSimilarity(
  assertion: SimilarityAssertion,
  ctx: GraderContext,
): Promise<GradeResult> {
  const reference = assertion.value ?? ctx.expected;
  if (reference === undefined) {
    return {
      grader: 'similarity',
      passed: false,
      score: 0,
      message: 'similarity assertion has no value and the case has no expected output',
    };
  }

  const threshold = assertion.threshold ?? DEFAULT_THRESHOLD;
  let score: number;
  let method: string;

  if (ctx.embeddings) {
    const [a, b] = await ctx.embeddings.embed([ctx.output, reference]);
    score = cosineDense(a as number[], b as number[]);
    method = 'embeddings';
  } else {
    score = ngramSimilarity(ctx.output, reference, assertion.ngram ?? DEFAULT_NGRAM);
    method = `char-${assertion.ngram ?? DEFAULT_NGRAM}gram`;
  }

  // Clamp float noise.
  score = Math.min(1, Math.max(0, score));
  const passed = score >= threshold;
  return {
    grader: 'similarity',
    passed,
    score,
    details: { method, threshold },
    ...(passed
      ? {}
      : { message: `similarity ${score.toFixed(3)} below threshold ${threshold} (${method})` }),
  };
}
