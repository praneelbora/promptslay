import type {
  ContainsAssertion,
  ExactAssertion,
  GradeResult,
  RegexAssertion,
} from '../core/types.js';
import type { GraderContext } from './types.js';

function preview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function gradeExact(assertion: ExactAssertion, ctx: GraderContext): GradeResult {
  const expected = assertion.value ?? ctx.expected;
  if (expected === undefined) {
    return {
      grader: 'exact',
      passed: false,
      score: 0,
      message: 'exact assertion has no value and the case has no expected output',
    };
  }

  const trim = assertion.trim ?? true;
  const caseSensitive = assertion.caseSensitive ?? true;
  let actual = trim ? ctx.output.trim() : ctx.output;
  let wanted = trim ? expected.trim() : expected;
  if (!caseSensitive) {
    actual = actual.toLowerCase();
    wanted = wanted.toLowerCase();
  }

  const passed = actual === wanted;
  return {
    grader: 'exact',
    passed,
    score: passed ? 1 : 0,
    ...(passed ? {} : { message: `expected "${preview(wanted)}" but got "${preview(actual)}"` }),
  };
}

export function gradeContains(assertion: ContainsAssertion, ctx: GraderContext): GradeResult {
  const needles = Array.isArray(assertion.value) ? assertion.value : [assertion.value];
  const caseSensitive = assertion.caseSensitive ?? true;
  const haystack = caseSensitive ? ctx.output : ctx.output.toLowerCase();

  const missing = needles.filter(
    (needle) => !haystack.includes(caseSensitive ? needle : needle.toLowerCase()),
  );
  const passed = missing.length === 0;

  return {
    grader: 'contains',
    passed,
    score: needles.length === 0 ? 1 : (needles.length - missing.length) / needles.length,
    ...(passed
      ? {}
      : { message: `output is missing ${missing.map((m) => `"${preview(m, 60)}"`).join(', ')}` }),
  };
}

export function gradeRegex(assertion: RegexAssertion, ctx: GraderContext): GradeResult {
  let regex: RegExp;
  try {
    regex = new RegExp(assertion.pattern, assertion.flags);
  } catch (error) {
    return {
      grader: 'regex',
      passed: false,
      score: 0,
      message: `invalid pattern: ${(error as Error).message}`,
    };
  }

  const passed = regex.test(ctx.output);
  return {
    grader: 'regex',
    passed,
    score: passed ? 1 : 0,
    ...(passed ? {} : { message: `output does not match /${assertion.pattern}/${assertion.flags ?? ''}` }),
  };
}
