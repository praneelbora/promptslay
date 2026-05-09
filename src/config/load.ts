import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateSuite } from '../core/suite.js';
import type { EvalSuite } from '../core/types.js';
import { loadSuiteFromYaml } from './yaml.js';

const MODULE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts']);

/**
 * Load a suite from disk. `.yaml`/`.yml` files go through the YAML loader;
 * JS/TS modules are imported and must export the suite as `default` or as a
 * named `suite` export. Running `.ts` suites directly requires a TS-capable
 * runtime (e.g. `tsx promptslay run suite.ts`).
 */
export async function loadSuite(filePath: string): Promise<EvalSuite> {
  const abs = isAbsolute(filePath) ? filePath : resolve(filePath);
  const ext = extname(abs).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return loadSuiteFromYaml(abs);
  }

  if (MODULE_EXTENSIONS.has(ext)) {
    const mod = (await import(pathToFileURL(abs).href)) as {
      default?: unknown;
      suite?: unknown;
    };
    const candidate = mod.default ?? mod.suite;
    if (candidate === undefined) {
      throw new Error(`${filePath}: export the suite as default or as "suite"`);
    }
    let suite: EvalSuite;
    try {
      suite = validateSuite(candidate);
    } catch (error) {
      throw new Error(`${filePath}: ${(error as Error).message}`);
    }
    if (suite.dataset !== undefined && !isAbsolute(suite.dataset)) {
      suite = { ...suite, dataset: resolve(dirname(abs), suite.dataset) };
    }
    return suite;
  }

  throw new Error(
    `${filePath}: unsupported suite file type "${ext}" (expected .yaml, .yml, .js, .mjs, .cjs, .ts or .mts)`,
  );
}
