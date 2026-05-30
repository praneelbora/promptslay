/**
 * A real-world suite in TypeScript: summarization graded by structure checks
 * plus an LLM judge with a weighted rubric.
 *
 * Needs ANTHROPIC_API_KEY. Run with:
 *   npx promptslay run examples/summarizer.suite.ts --fail-on-regression
 */
import { defineSuite } from 'promptslay';

const ARTICLE = `
The Model Context Protocol (MCP) is an open standard for connecting AI
assistants to the systems where data lives. Instead of bespoke integrations
per tool and per model, MCP defines one protocol for exposing tools,
resources and prompts to any compliant client. Servers can run locally over
stdio or remotely over HTTP, and clients discover capabilities at runtime.
`.trim();

export default defineSuite({
  name: 'summarizer',
  description: 'Two-sentence summaries: factual, terse, no markdown.',
  provider: 'anthropic',
  model: 'claude-opus-4-8', // strong default; try claude-haiku-4-5 for smoke runs
  prompt: {
    system:
      'You summarize technical text in exactly two sentences. Plain prose, no markdown, no preamble.',
    user: 'Summarize this:\n\n{{article}}',
  },
  cases: [
    {
      id: 'mcp-article',
      vars: { article: ARTICLE },
      assertions: [
        { type: 'contains', value: 'MCP' },
        { type: 'regex', pattern: '^[^#*-]' }, // no markdown artifacts
        {
          type: 'llm-judge',
          quick: true, // judge on the fast tier (claude-haiku-4-5)
          threshold: 0.7,
          rubric: [
            { name: 'faithful', description: 'No claims absent from the source text.', weight: 2 },
            { name: 'concise', description: 'At most two sentences, no filler.' },
            { name: 'complete', description: 'Captures what MCP is and why it exists.' },
          ],
        },
      ],
    },
    {
      id: 'json-mode',
      vars: { article: 'Reply with a JSON object {"summary": "..."} summarizing: MCP is a protocol.' },
      assertions: [
        {
          type: 'json-schema',
          schema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
          },
        },
      ],
    },
  ],
});
