import { describe, expect, it } from 'vitest';

import { defineSuite, SuiteValidationError, validateSuite } from '../src/core/suite.js';

const minimal = {
  name: 'demo',
  prompt: { user: 'Say {{word}}' },
  cases: [{ id: 'one', vars: { word: 'hi' }, expected: 'hi' }],
};

describe('defineSuite / validateSuite', () => {
  it('returns the suite unchanged when valid', () => {
    expect(defineSuite(minimal)).toBe(minimal);
  });

  it('rejects a missing name', () => {
    expect(() => validateSuite({ ...minimal, name: '' })).toThrow(SuiteValidationError);
  });

  it('rejects a missing prompt.user', () => {
    expect(() => validateSuite({ name: 'x', prompt: {}, cases: minimal.cases })).toThrow(
      /prompt\.user/,
    );
  });

  it('requires cases or a dataset', () => {
    expect(() => validateSuite({ name: 'x', prompt: { user: 'hi' } })).toThrow(
      /inline cases, a dataset/,
    );
  });

  it('accepts dataset-only suites', () => {
    expect(() =>
      validateSuite({ name: 'x', prompt: { user: 'hi' }, dataset: './cases.jsonl' }),
    ).not.toThrow();
  });

  it('rejects duplicate case ids', () => {
    expect(() =>
      validateSuite({
        ...minimal,
        cases: [
          { id: 'dup', expected: 'a' },
          { id: 'dup', expected: 'b' },
        ],
      }),
    ).toThrow(/duplicate case id "dup"/);
  });

  it('rejects cases without ids', () => {
    expect(() => validateSuite({ ...minimal, cases: [{ expected: 'a' }] })).toThrow(/id/);
  });

  it('rejects unknown assertion types', () => {
    expect(() =>
      validateSuite({
        ...minimal,
        cases: [{ id: 'one', assertions: [{ type: 'levenshtein' }] }],
      }),
    ).toThrow(/unknown assertion type "levenshtein"/);
  });

  it('rejects invalid regex patterns', () => {
    expect(() =>
      validateSuite({
        ...minimal,
        cases: [{ id: 'one', assertions: [{ type: 'regex', pattern: '(' }] }],
      }),
    ).toThrow(/invalid regex/);
  });

  it('rejects out-of-range similarity thresholds', () => {
    expect(() =>
      validateSuite({
        ...minimal,
        assertions: [{ type: 'similarity', value: 'x', threshold: 1.5 }],
      }),
    ).toThrow(/threshold/);
  });

  it('rejects llm-judge assertions without a rubric', () => {
    expect(() =>
      validateSuite({ ...minimal, assertions: [{ type: 'llm-judge', rubric: [] }] }),
    ).toThrow(/rubric/);
  });

  it('rejects rubric criteria missing descriptions', () => {
    expect(() =>
      validateSuite({
        ...minimal,
        assertions: [{ type: 'llm-judge', rubric: [{ name: 'tone' }] }],
      }),
    ).toThrow(/description/);
  });
});
