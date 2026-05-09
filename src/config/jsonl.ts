import { readFile } from 'node:fs/promises';

import type { EvalCase } from '../core/types.js';

/**
 * Load eval cases from a JSONL file — one JSON object per line:
 *
 * ```jsonl
 * {"id": "greeting", "vars": {"name": "Ada"}, "expected": "Hello Ada"}
 * {"vars": {"name": "Bob"}, "assertions": [{"type": "contains", "value": "Bob"}]}
 * ```
 *
 * Lines without an `id` get `case-<lineNumber>`.
 */
export async function loadJsonlCases(filePath: string): Promise<EvalCase[]> {
  const raw = await readFile(filePath, 'utf8');
  const cases: EvalCase[] = [];

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] as string).trim();
    if (line === '' || line.startsWith('#')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${i + 1}: invalid JSON — ${(error as Error).message}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${filePath}:${i + 1}: each line must be a JSON object`);
    }

    const record = parsed as Record<string, unknown>;
    const id = typeof record['id'] === 'string' && record['id'] !== '' ? record['id'] : `case-${i + 1}`;
    cases.push({ ...(record as Partial<EvalCase>), id } as EvalCase);
  }

  return cases;
}
