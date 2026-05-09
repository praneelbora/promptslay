import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { parse } from 'yaml';

import { validateSuite } from '../core/suite.js';
import type { EvalSuite } from '../core/types.js';

/**
 * Load and validate a suite from YAML. The YAML shape mirrors
 * {@link EvalSuite} 1:1; dataset paths are resolved relative to the YAML file.
 */
export async function loadSuiteFromYaml(filePath: string): Promise<EvalSuite> {
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    throw new Error(`${filePath}: invalid YAML — ${(error as Error).message}`);
  }

  let suite: EvalSuite;
  try {
    suite = validateSuite(parsed);
  } catch (error) {
    throw new Error(`${filePath}: ${(error as Error).message}`);
  }

  if (suite.dataset !== undefined && !isAbsolute(suite.dataset)) {
    suite = { ...suite, dataset: resolve(dirname(filePath), suite.dataset) };
  }
  return suite;
}
