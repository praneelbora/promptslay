import type { Assertion, GradeResult } from '../core/types.js';
import { gradeContains, gradeExact, gradeRegex } from './deterministic.js';
import { gradeJsonSchema } from './json-schema.js';
import { gradeLlmJudge } from './llm-judge.js';
import { gradeSimilarity } from './similarity.js';
import type { GraderContext } from './types.js';

/** Dispatch a single assertion to its grader. */
export async function grade(assertion: Assertion, ctx: GraderContext): Promise<GradeResult> {
  switch (assertion.type) {
    case 'exact':
      return gradeExact(assertion, ctx);
    case 'contains':
      return gradeContains(assertion, ctx);
    case 'regex':
      return gradeRegex(assertion, ctx);
    case 'json-schema':
      return gradeJsonSchema(assertion, ctx);
    case 'similarity':
      return gradeSimilarity(assertion, ctx);
    case 'llm-judge':
      return gradeLlmJudge(assertion, ctx);
    default: {
      const exhaustive: never = assertion;
      throw new Error(`Unsupported assertion: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export { gradeContains, gradeExact, gradeRegex } from './deterministic.js';
export { extractJsonBlock, gradeJsonSchema } from './json-schema.js';
export {
  aggregateVerdict,
  buildJudgePrompt,
  gradeLlmJudge,
} from './llm-judge.js';
export type { JudgeCriterionScore, JudgeVerdict } from './llm-judge.js';
export {
  charNgrams,
  cosineDense,
  cosineSparse,
  gradeSimilarity,
  ngramSimilarity,
} from './similarity.js';
export type { EmbeddingProvider, GraderContext } from './types.js';
