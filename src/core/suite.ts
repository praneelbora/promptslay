import type { Assertion, EvalCase, EvalSuite } from './types.js';

const ASSERTION_TYPES = new Set([
  'exact',
  'contains',
  'regex',
  'json-schema',
  'similarity',
  'llm-judge',
]);

export class SuiteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuiteValidationError';
  }
}

function fail(message: string): never {
  throw new SuiteValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAssertion(assertion: unknown, where: string): asserts assertion is Assertion {
  if (!isRecord(assertion)) fail(`${where}: assertion must be an object`);
  const type = assertion['type'];
  if (typeof type !== 'string' || !ASSERTION_TYPES.has(type)) {
    fail(`${where}: unknown assertion type "${String(type)}"`);
  }
  switch (type) {
    case 'contains':
      if (assertion['value'] === undefined) fail(`${where}: "contains" requires a value`);
      break;
    case 'regex':
      if (typeof assertion['pattern'] !== 'string') fail(`${where}: "regex" requires a pattern`);
      try {
        new RegExp(assertion['pattern'], assertion['flags'] as string | undefined);
      } catch (error) {
        fail(`${where}: invalid regex — ${(error as Error).message}`);
      }
      break;
    case 'json-schema':
      if (!isRecord(assertion['schema'])) fail(`${where}: "json-schema" requires a schema object`);
      break;
    case 'similarity': {
      const threshold = assertion['threshold'];
      if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0 || threshold > 1)) {
        fail(`${where}: similarity threshold must be a number in [0, 1]`);
      }
      break;
    }
    case 'llm-judge': {
      const rubric = assertion['rubric'];
      if (!Array.isArray(rubric) || rubric.length === 0) {
        fail(`${where}: "llm-judge" requires a non-empty rubric`);
      }
      for (const [i, criterion] of rubric.entries()) {
        if (!isRecord(criterion) || typeof criterion['name'] !== 'string' || criterion['name'] === '') {
          fail(`${where}: rubric[${i}] needs a name`);
        }
        if (typeof criterion['description'] !== 'string' || criterion['description'] === '') {
          fail(`${where}: rubric[${i}] ("${String(criterion['name'])}") needs a description`);
        }
        const weight = criterion['weight'];
        if (weight !== undefined && (typeof weight !== 'number' || weight <= 0)) {
          fail(`${where}: rubric[${i}] weight must be a positive number`);
        }
      }
      break;
    }
    default:
      break;
  }
}

function validateCase(evalCase: unknown, index: number): asserts evalCase is EvalCase {
  const where = `cases[${index}]`;
  if (!isRecord(evalCase)) fail(`${where}: case must be an object`);
  if (typeof evalCase['id'] !== 'string' || evalCase['id'].trim() === '') {
    fail(`${where}: case needs a non-empty string id`);
  }
  if (evalCase['vars'] !== undefined && !isRecord(evalCase['vars'])) {
    fail(`${where}: vars must be an object`);
  }
  if (evalCase['assertions'] !== undefined) {
    if (!Array.isArray(evalCase['assertions'])) fail(`${where}: assertions must be an array`);
    for (const [i, assertion] of evalCase['assertions'].entries()) {
      validateAssertion(assertion, `${where}.assertions[${i}]`);
    }
  }
}

/**
 * Validate an arbitrary value as an {@link EvalSuite}. Used by both
 * {@link defineSuite} (TS suites) and the YAML loader, so suites get the same
 * error messages no matter how they were authored.
 */
export function validateSuite(input: unknown): EvalSuite {
  if (!isRecord(input)) fail('suite must be an object');
  if (typeof input['name'] !== 'string' || input['name'].trim() === '') {
    fail('suite needs a non-empty name');
  }
  const prompt = input['prompt'];
  if (!isRecord(prompt) || typeof prompt['user'] !== 'string' || prompt['user'].trim() === '') {
    fail(`suite "${input['name']}": prompt.user is required`);
  }
  if (prompt['system'] !== undefined && typeof prompt['system'] !== 'string') {
    fail(`suite "${input['name']}": prompt.system must be a string`);
  }
  if (input['cases'] === undefined && input['dataset'] === undefined) {
    fail(`suite "${input['name']}": provide inline cases, a dataset path, or both`);
  }
  if (input['cases'] !== undefined) {
    if (!Array.isArray(input['cases'])) fail(`suite "${input['name']}": cases must be an array`);
    const seen = new Set<string>();
    for (const [i, evalCase] of input['cases'].entries()) {
      validateCase(evalCase, i);
      const id = (evalCase as EvalCase).id;
      if (seen.has(id)) fail(`suite "${input['name']}": duplicate case id "${id}"`);
      seen.add(id);
    }
  }
  if (input['dataset'] !== undefined && typeof input['dataset'] !== 'string') {
    fail(`suite "${input['name']}": dataset must be a file path`);
  }
  if (input['assertions'] !== undefined) {
    if (!Array.isArray(input['assertions'])) {
      fail(`suite "${input['name']}": assertions must be an array`);
    }
    for (const [i, assertion] of input['assertions'].entries()) {
      validateAssertion(assertion, `suite assertions[${i}]`);
    }
  }
  return input as unknown as EvalSuite;
}

/**
 * Define an eval suite in TypeScript with full type inference and eager
 * validation:
 *
 * ```ts
 * export default defineSuite({
 *   name: 'summarizer',
 *   prompt: { user: 'Summarize: {{text}}' },
 *   cases: [{ id: 'short', vars: { text: '…' }, assertions: [...] }],
 * });
 * ```
 */
export function defineSuite(suite: EvalSuite): EvalSuite {
  return validateSuite(suite);
}
