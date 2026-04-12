import { DEFAULT_MODEL, FAST_MODEL } from '../core/constants.js';
import type { GradeResult, LlmJudgeAssertion, RubricCriterion } from '../core/types.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import type { ProviderAdapter } from '../providers/types.js';
import { extractJsonBlock } from './json-schema.js';
import type { GraderContext } from './types.js';

const DEFAULT_THRESHOLD = 0.7;
const MIN_SCORE = 1;
const MAX_SCORE = 5;

const JUDGE_SYSTEM = [
  'You are a strict, impartial evaluator of LLM outputs.',
  'Score the candidate output against each rubric criterion on an integer scale of 1 (very poor) to 5 (excellent).',
  'Judge only what is in the output. Do not reward confident wording over substance.',
  'Respond with JSON only — no prose, no code fences — exactly matching:',
  '{"criteria": [{"name": "<criterion name>", "score": <1-5>, "reasoning": "<one sentence>"}], "summary": "<one sentence overall>"}',
].join('\n');

/** One scored criterion in the judge's structured verdict. */
export interface JudgeCriterionScore {
  name: string;
  score: number;
  reasoning?: string;
}

export interface JudgeVerdict {
  criteria: JudgeCriterionScore[];
  summary?: string;
}

export function buildJudgePrompt(rubric: RubricCriterion[], ctx: GraderContext): string {
  const sections = [
    '<task>',
    ctx.prompt.system ? `System prompt:\n${ctx.prompt.system}\n` : '',
    `User prompt:\n${ctx.prompt.user}`,
    '</task>',
    '',
    '<candidate_output>',
    ctx.output,
    '</candidate_output>',
  ];
  if (ctx.expected !== undefined) {
    sections.push('', '<reference_output>', ctx.expected, '</reference_output>');
  }
  sections.push(
    '',
    '<rubric>',
    ...rubric.map(
      (c, i) => `${i + 1}. ${c.name} (weight ${c.weight ?? 1}): ${c.description}`,
    ),
    '</rubric>',
    '',
    'Score every criterion. Respond with JSON only.',
  );
  return sections.filter((line) => line !== undefined).join('\n');
}

function parseVerdict(text: string, rubric: RubricCriterion[]): JudgeVerdict {
  const parsed = JSON.parse(extractJsonBlock(text)) as JudgeVerdict;
  if (!Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
    throw new Error('verdict has no criteria array');
  }
  for (const criterion of rubric) {
    const scored = parsed.criteria.find((c) => c.name === criterion.name);
    if (!scored) throw new Error(`judge did not score criterion "${criterion.name}"`);
    if (
      typeof scored.score !== 'number' ||
      scored.score < MIN_SCORE ||
      scored.score > MAX_SCORE
    ) {
      throw new Error(
        `criterion "${criterion.name}" has out-of-range score ${String(scored.score)}`,
      );
    }
  }
  return parsed;
}

/** Weighted mean of criterion scores, normalized to [0, 1]. */
export function aggregateVerdict(verdict: JudgeVerdict, rubric: RubricCriterion[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const criterion of rubric) {
    const scored = verdict.criteria.find((c) => c.name === criterion.name);
    if (!scored) continue;
    const weight = criterion.weight ?? 1;
    weighted += weight * ((scored.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE));
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

/**
 * LLM-as-judge grader: asks a judge model (claude-opus-4-8 by default,
 * claude-haiku-4-5 in quick mode) to score the output against a numeric
 * rubric and returns the normalized weighted score as the grade.
 */
export async function gradeLlmJudge(
  assertion: LlmJudgeAssertion,
  ctx: GraderContext,
): Promise<GradeResult> {
  const provider: ProviderAdapter = ctx.judgeProvider ?? new AnthropicProvider();
  const model = assertion.judgeModel ?? (assertion.quick ? FAST_MODEL : DEFAULT_MODEL);
  const threshold = assertion.threshold ?? DEFAULT_THRESHOLD;

  let generation;
  try {
    generation = await provider.generate(
      { system: JUDGE_SYSTEM, user: buildJudgePrompt(assertion.rubric, ctx) },
      { model, params: { maxTokens: 1024 } },
    );
  } catch (error) {
    return {
      grader: 'llm-judge',
      passed: false,
      score: 0,
      message: `judge call failed: ${(error as Error).message}`,
    };
  }

  let verdict: JudgeVerdict;
  try {
    verdict = parseVerdict(generation.text, assertion.rubric);
  } catch (error) {
    return {
      grader: 'llm-judge',
      passed: false,
      score: 0,
      message: `could not parse judge verdict: ${(error as Error).message}`,
      details: { raw: generation.text },
      costUsd: generation.costUsd,
    };
  }

  const score = aggregateVerdict(verdict, assertion.rubric);
  const passed = score >= threshold;
  return {
    grader: 'llm-judge',
    passed,
    score,
    details: { verdict, judgeModel: model, threshold },
    costUsd: generation.costUsd,
    ...(passed
      ? {}
      : {
          message: `judge score ${score.toFixed(2)} below threshold ${threshold}${
            verdict.summary ? ` — ${verdict.summary}` : ''
          }`,
        }),
  };
}
