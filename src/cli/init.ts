import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SAMPLE_SUITE = `# promptslay suite — run with: npx promptslay run promptslay.suite.yaml
name: my-first-suite
description: Replace this with a suite for one of your real prompts.

# "mock" runs offline and echoes the prompt — great for trying the workflow.
# Switch to "anthropic" (and set ANTHROPIC_API_KEY) for real evals.
provider: mock
model: claude-haiku-4-5

prompt:
  system: You are a concise assistant. Answer in one sentence.
  user: |
    {{question}}

cases:
  - id: capital-of-france
    vars:
      question: What is the capital of France?
    assertions:
      - type: contains
        value: France

  - id: json-output
    vars:
      question: 'Return JSON: {"answer": "..."} for: what is 2+2?'
    assertions:
      - type: regex
        pattern: "2\\\\+2"
`;

const GITIGNORE_BLOCK = `
# promptslay
.promptslay/cache/
promptslay-report/
`;

const ENV_EXAMPLE = `ANTHROPIC_API_KEY=
`;

export interface InitResult {
  created: string[];
  skipped: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/** Scaffold a starter suite plus .gitignore / .env.example entries. */
export async function runInit(cwd: string): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const suitePath = join(cwd, 'promptslay.suite.yaml');
  if (await exists(suitePath)) {
    skipped.push('promptslay.suite.yaml');
  } else {
    await writeFile(suitePath, SAMPLE_SUITE, 'utf8');
    created.push('promptslay.suite.yaml');
  }

  const gitignorePath = join(cwd, '.gitignore');
  if (await exists(gitignorePath)) {
    const current = await readFile(gitignorePath, 'utf8');
    if (current.includes('.promptslay/cache/')) {
      skipped.push('.gitignore');
    } else {
      await appendFile(gitignorePath, GITIGNORE_BLOCK, 'utf8');
      created.push('.gitignore (appended)');
    }
  } else {
    await writeFile(gitignorePath, GITIGNORE_BLOCK.trimStart(), 'utf8');
    created.push('.gitignore');
  }

  const envPath = join(cwd, '.env.example');
  if (await exists(envPath)) {
    skipped.push('.env.example');
  } else {
    await writeFile(envPath, ENV_EXAMPLE, 'utf8');
    created.push('.env.example');
  }

  return { created, skipped };
}
