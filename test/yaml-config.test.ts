import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadJsonlCases } from '../src/config/jsonl.js';
import { loadSuiteFromYaml } from '../src/config/yaml.js';

describe('loadSuiteFromYaml', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'promptslay-yaml-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads and validates a complete suite', async () => {
    const file = join(dir, 'suite.yaml');
    await writeFile(
      file,
      [
        'name: summarizer',
        'provider: mock',
        'model: claude-haiku-4-5',
        'prompt:',
        '  system: You are terse.',
        '  user: "Summarize: {{text}}"',
        'assertions:',
        '  - type: contains',
        '    value: summary',
        'cases:',
        '  - id: one',
        '    vars: { text: hello }',
      ].join('\n'),
      'utf8',
    );

    const suite = await loadSuiteFromYaml(file);
    expect(suite.name).toBe('summarizer');
    expect(suite.prompt.user).toContain('{{text}}');
    expect(suite.assertions?.[0]?.type).toBe('contains');
    expect(suite.cases).toHaveLength(1);
  });

  it('resolves dataset paths relative to the YAML file', async () => {
    const file = join(dir, 'suite.yaml');
    await writeFile(
      file,
      ['name: ds', 'prompt: { user: "{{q}}" }', 'dataset: data/cases.jsonl'].join('\n'),
      'utf8',
    );
    const suite = await loadSuiteFromYaml(file);
    expect(suite.dataset).toBe(join(dir, 'data', 'cases.jsonl'));
  });

  it('rejects invalid YAML and invalid suites with the file path in the error', async () => {
    const broken = join(dir, 'broken.yaml');
    await writeFile(broken, 'name: [unclosed', 'utf8');
    await expect(loadSuiteFromYaml(broken)).rejects.toThrow(/broken\.yaml/);

    const invalid = join(dir, 'invalid.yaml');
    await writeFile(invalid, 'description: missing name and prompt', 'utf8');
    await expect(loadSuiteFromYaml(invalid)).rejects.toThrow(/invalid\.yaml/);
  });
});

describe('loadJsonlCases', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'promptslay-jsonl-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses one case per line, skipping blanks', async () => {
    const file = join(dir, 'cases.jsonl');
    await writeFile(
      file,
      [
        '{"id":"a","vars":{"q":"1"},"expected":"one"}',
        '',
        '{"id":"b","vars":{"q":"2"}}',
        '',
      ].join('\n'),
      'utf8',
    );
    const cases = await loadJsonlCases(file);
    expect(cases.map((c) => c.id)).toEqual(['a', 'b']);
    expect(cases[0]?.expected).toBe('one');
  });

  it('reports the offending line number on parse errors', async () => {
    const file = join(dir, 'bad.jsonl');
    await writeFile(file, '{"id":"a"}\n{oops\n', 'utf8');
    await expect(loadJsonlCases(file)).rejects.toThrow(/bad\.jsonl:2/);
  });
});
