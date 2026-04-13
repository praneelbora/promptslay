import { describe, expect, it } from 'vitest';

import { gradeContains, gradeExact, gradeRegex } from '../src/graders/deterministic.js';
import type { GraderContext } from '../src/graders/types.js';

function ctx(output: string, expected?: string): GraderContext {
  return {
    output,
    ...(expected !== undefined ? { expected } : {}),
    prompt: { user: 'irrelevant' },
  };
}

describe('gradeExact', () => {
  it('passes on an exact match', () => {
    const result = gradeExact({ type: 'exact', value: 'hello' }, ctx('hello'));
    expect(result).toMatchObject({ passed: true, score: 1 });
  });

  it('trims whitespace by default', () => {
    expect(gradeExact({ type: 'exact', value: 'hello' }, ctx('  hello\n')).passed).toBe(true);
  });

  it('honors trim: false', () => {
    expect(gradeExact({ type: 'exact', value: 'hello', trim: false }, ctx('hello\n')).passed).toBe(
      false,
    );
  });

  it('is case sensitive by default', () => {
    expect(gradeExact({ type: 'exact', value: 'Hello' }, ctx('hello')).passed).toBe(false);
    expect(
      gradeExact({ type: 'exact', value: 'Hello', caseSensitive: false }, ctx('hello')).passed,
    ).toBe(true);
  });

  it('falls back to the case expected value', () => {
    expect(gradeExact({ type: 'exact' }, ctx('yes', 'yes')).passed).toBe(true);
  });

  it('fails with a message when no expected value exists at all', () => {
    const result = gradeExact({ type: 'exact' }, ctx('whatever'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/no value/);
  });

  it('reports a useful failure message', () => {
    const result = gradeExact({ type: 'exact', value: 'alpha' }, ctx('beta'));
    expect(result.message).toContain('alpha');
    expect(result.message).toContain('beta');
  });
});

describe('gradeContains', () => {
  it('passes when the substring is present', () => {
    expect(gradeContains({ type: 'contains', value: 'world' }, ctx('hello world')).passed).toBe(
      true,
    );
  });

  it('requires every needle of an array', () => {
    const result = gradeContains(
      { type: 'contains', value: ['hello', 'mars'] },
      ctx('hello world'),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(0.5);
    expect(result.message).toContain('mars');
  });

  it('supports case-insensitive matching', () => {
    expect(
      gradeContains({ type: 'contains', value: 'HELLO', caseSensitive: false }, ctx('hello'))
        .passed,
    ).toBe(true);
  });
});

describe('gradeRegex', () => {
  it('matches patterns', () => {
    expect(gradeRegex({ type: 'regex', pattern: '^\\d{3}$' }, ctx('123')).passed).toBe(true);
    expect(gradeRegex({ type: 'regex', pattern: '^\\d{3}$' }, ctx('12a')).passed).toBe(false);
  });

  it('supports flags', () => {
    expect(gradeRegex({ type: 'regex', pattern: 'HELLO', flags: 'i' }, ctx('hello')).passed).toBe(
      true,
    );
  });

  it('fails gracefully on an invalid pattern', () => {
    const result = gradeRegex({ type: 'regex', pattern: '(' }, ctx('x'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/invalid pattern/);
  });
});
