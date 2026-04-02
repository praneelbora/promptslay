import { Ajv } from 'ajv';

import type { GradeResult, JsonSchemaAssertion } from '../core/types.js';
import type { GraderContext } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Pull a JSON document out of model output. Tolerates markdown code fences
 * and prose around the payload — models love both.
 */
export function extractJsonBlock(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();

  const trimmed = text.trim();
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export function gradeJsonSchema(assertion: JsonSchemaAssertion, ctx: GraderContext): GradeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(ctx.output));
  } catch (error) {
    return {
      grader: 'json-schema',
      passed: false,
      score: 0,
      message: `output is not valid JSON: ${(error as Error).message}`,
    };
  }

  let validate;
  try {
    validate = ajv.compile(assertion.schema);
  } catch (error) {
    return {
      grader: 'json-schema',
      passed: false,
      score: 0,
      message: `invalid JSON schema: ${(error as Error).message}`,
    };
  }

  const valid = validate(parsed);
  if (valid) {
    return { grader: 'json-schema', passed: true, score: 1 };
  }

  const errors = (validate.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`)
    .join('; ');
  return {
    grader: 'json-schema',
    passed: false,
    score: 0,
    message: `schema validation failed: ${errors}`,
    details: validate.errors,
  };
}
