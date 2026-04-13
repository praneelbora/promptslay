import { describe, expect, it } from 'vitest';

import { extractJsonBlock, gradeJsonSchema } from '../src/graders/json-schema.js';
import type { GraderContext } from '../src/graders/types.js';

const ctx = (output: string): GraderContext => ({ output, prompt: { user: 'x' } });

const personSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
  },
  required: ['name', 'age'],
  additionalProperties: false,
};

describe('extractJsonBlock', () => {
  it('returns plain JSON untouched', () => {
    expect(extractJsonBlock('{"a": 1}')).toBe('{"a": 1}');
  });

  it('strips markdown code fences', () => {
    expect(extractJsonBlock('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(extractJsonBlock('```\n[1, 2]\n```')).toBe('[1, 2]');
  });

  it('extracts JSON surrounded by prose', () => {
    expect(extractJsonBlock('Sure! Here you go: {"a": 1} Hope that helps.')).toBe('{"a": 1}');
  });
});

describe('gradeJsonSchema', () => {
  it('passes valid JSON', () => {
    const result = gradeJsonSchema(
      { type: 'json-schema', schema: personSchema },
      ctx('{"name": "Ada", "age": 36}'),
    );
    expect(result).toMatchObject({ passed: true, score: 1 });
  });

  it('passes valid JSON inside a code fence', () => {
    const result = gradeJsonSchema(
      { type: 'json-schema', schema: personSchema },
      ctx('```json\n{"name": "Ada", "age": 36}\n```'),
    );
    expect(result.passed).toBe(true);
  });

  it('fails non-JSON output', () => {
    const result = gradeJsonSchema({ type: 'json-schema', schema: personSchema }, ctx('not json'));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/not valid JSON/);
  });

  it('fails schema violations with error details', () => {
    const result = gradeJsonSchema(
      { type: 'json-schema', schema: personSchema },
      ctx('{"name": "Ada", "age": -1}'),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/schema validation failed/);
    expect(result.message).toContain('/age');
  });

  it('fails on missing required properties', () => {
    const result = gradeJsonSchema(
      { type: 'json-schema', schema: personSchema },
      ctx('{"name": "Ada"}'),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain('age');
  });
});
