import { describe, expect, it } from 'vitest';

import { aggregateVerdict, buildJudgePrompt, gradeLlmJudge } from '../src/graders/llm-judge.js';
import { MockProvider } from '../src/providers/mock.js';
import type { GraderContext } from '../src/graders/types.js';
import type { LlmJudgeAssertion, RubricCriterion } from '../src/core/types.js';

const rubric: RubricCriterion[] = [
  { name: 'accuracy', description: 'Factually correct', weight: 2 },
  { name: 'tone', description: 'Friendly and professional' },
];

const assertion: LlmJudgeAssertion = { type: 'llm-judge', rubric };

function judgeReplying(reply: string): MockProvider {
  return new MockProvider({ respond: () => reply });
}

function ctx(judge: MockProvider, output = 'The answer is 4.'): GraderContext {
  return {
    output,
    prompt: { system: 'Be helpful.', user: 'What is 2+2?' },
    judgeProvider: judge,
  };
}

describe('buildJudgePrompt', () => {
  it('includes task, output and rubric', () => {
    const prompt = buildJudgePrompt(rubric, ctx(judgeReplying('')));
    expect(prompt).toContain('What is 2+2?');
    expect(prompt).toContain('The answer is 4.');
    expect(prompt).toContain('accuracy (weight 2)');
    expect(prompt).toContain('tone (weight 1)');
  });

  it('includes the reference output when present', () => {
    const context = { ...ctx(judgeReplying('')), expected: '4' };
    expect(buildJudgePrompt(rubric, context)).toContain('<reference_output>');
  });
});

describe('aggregateVerdict', () => {
  it('computes the normalized weighted mean', () => {
    const score = aggregateVerdict(
      {
        criteria: [
          { name: 'accuracy', score: 5 }, // weight 2 -> 1.0
          { name: 'tone', score: 3 }, // weight 1 -> 0.5
        ],
      },
      rubric,
    );
    expect(score).toBeCloseTo((2 * 1 + 1 * 0.5) / 3);
  });
});

describe('gradeLlmJudge', () => {
  it('passes a strong verdict', async () => {
    const judge = judgeReplying(
      JSON.stringify({
        criteria: [
          { name: 'accuracy', score: 5, reasoning: 'Correct.' },
          { name: 'tone', score: 4, reasoning: 'Pleasant.' },
        ],
        summary: 'Solid answer.',
      }),
    );
    const result = await gradeLlmJudge(assertion, ctx(judge));
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.details).toMatchObject({ judgeModel: 'claude-opus-4-8' });
  });

  it('fails a weak verdict with the judge summary in the message', async () => {
    const judge = judgeReplying(
      JSON.stringify({
        criteria: [
          { name: 'accuracy', score: 1, reasoning: 'Wrong.' },
          { name: 'tone', score: 2, reasoning: 'Curt.' },
        ],
        summary: 'Incorrect and unfriendly.',
      }),
    );
    const result = await gradeLlmJudge(assertion, ctx(judge));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Incorrect and unfriendly.');
  });

  it('parses verdicts wrapped in code fences', async () => {
    const judge = judgeReplying(
      '```json\n{"criteria": [{"name": "accuracy", "score": 5}, {"name": "tone", "score": 5}]}\n```',
    );
    const result = await gradeLlmJudge(assertion, ctx(judge));
    expect(result.passed).toBe(true);
  });

  it('fails gracefully on unparseable verdicts', async () => {
    const result = await gradeLlmJudge(assertion, ctx(judgeReplying('I refuse to answer.')));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/could not parse judge verdict/);
  });

  it('fails when a criterion is missing from the verdict', async () => {
    const judge = judgeReplying(
      JSON.stringify({ criteria: [{ name: 'accuracy', score: 5 }] }),
    );
    const result = await gradeLlmJudge(assertion, ctx(judge));
    expect(result.passed).toBe(false);
    expect(result.message).toContain('tone');
  });

  it('defaults to the strong judge model and uses the fast tier in quick mode', async () => {
    const judge = judgeReplying(
      JSON.stringify({
        criteria: [
          { name: 'accuracy', score: 5 },
          { name: 'tone', score: 5 },
        ],
      }),
    );
    await gradeLlmJudge(assertion, ctx(judge));
    expect(judge.calls[0]?.options.model).toBe('claude-opus-4-8');

    await gradeLlmJudge({ ...assertion, quick: true }, ctx(judge));
    expect(judge.calls[1]?.options.model).toBe('claude-haiku-4-5');

    await gradeLlmJudge({ ...assertion, judgeModel: 'claude-sonnet-4-6' }, ctx(judge));
    expect(judge.calls[2]?.options.model).toBe('claude-sonnet-4-6');
  });

  it('honors a custom threshold', async () => {
    const judge = judgeReplying(
      JSON.stringify({
        criteria: [
          { name: 'accuracy', score: 4 },
          { name: 'tone', score: 4 },
        ],
      }),
    );
    const strict = await gradeLlmJudge({ ...assertion, threshold: 0.9 }, ctx(judge));
    expect(strict.passed).toBe(false);
    const lenient = await gradeLlmJudge({ ...assertion, threshold: 0.5 }, ctx(judge));
    expect(lenient.passed).toBe(true);
  });

  it('reports the judge call cost', async () => {
    const judge = judgeReplying(
      JSON.stringify({
        criteria: [
          { name: 'accuracy', score: 5 },
          { name: 'tone', score: 5 },
        ],
      }),
    );
    const result = await gradeLlmJudge(assertion, ctx(judge));
    expect(result.costUsd).toBeGreaterThan(0);
  });
});
