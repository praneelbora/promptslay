#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Command } from 'commander';
import pc from 'picocolors';

import { loadSuite } from '../config/load.js';
import { PROMPTSLAY_DIR } from '../core/constants.js';
import { runSuite } from '../core/runner.js';
import type { RunResult } from '../core/types.js';
import { renderConsoleReport } from '../report/console.js';
import { writeHtmlReport } from '../report/html.js';
import { slugify } from '../snapshot/baseline.js';
import { VERSION } from '../version.js';
import { runInit } from './init.js';

const LAST_RUN_FILE = join(PROMPTSLAY_DIR, 'runs', 'last-run.json');

const program = new Command();

program
  .name('promptslay')
  .description('Unit tests for your prompts — eval, snapshot and gate prompt changes in CI.')
  .version(VERSION);

interface RunCommandOptions {
  reporter: string;
  failOnRegression: boolean;
  updateBaselines: boolean;
  concurrency: string;
  cache: boolean;
  output: string;
}

program
  .command('run')
  .description('Run one or more eval suites (.yaml/.yml or .js/.ts modules)')
  .argument('<suites...>', 'paths to suite files')
  .option('-r, --reporter <reporters>', 'comma-separated: console, html, json', 'console')
  .option('--fail-on-regression', 'exit non-zero when output drifts from the baseline', false)
  .option('--update-baselines', 'accept current outputs as the new baseline', false)
  .option('-c, --concurrency <n>', 'cases evaluated in parallel', '4')
  .option('--no-cache', 'bypass the disk response cache')
  .option('-o, --output <dir>', 'directory for the HTML report', 'promptslay-report')
  .action(async (suitePaths: string[], options: RunCommandOptions) => {
    const reporters = new Set(
      options.reporter.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean),
    );
    for (const reporter of reporters) {
      if (!['console', 'html', 'json'].includes(reporter)) {
        program.error(`Unknown reporter "${reporter}" (expected console, html or json)`);
      }
    }
    const concurrency = Number.parseInt(options.concurrency, 10);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      program.error(`--concurrency must be a positive integer, got "${options.concurrency}"`);
    }

    const cwd = process.cwd();
    const results: RunResult[] = [];

    for (const suitePath of suitePaths) {
      const suite = await loadSuite(suitePath);
      const result = await runSuite(suite, {
        concurrency,
        cache: options.cache,
        updateBaselines: options.updateBaselines,
        cwd,
      });
      results.push(result);

      if (reporters.has('console')) {
        process.stdout.write(`${renderConsoleReport(result)}\n`);
      }
      if (reporters.has('html')) {
        const outDir =
          suitePaths.length > 1 ? join(options.output, slugify(result.suite)) : options.output;
        const htmlPath = await writeHtmlReport(result, outDir);
        process.stderr.write(pc.dim(`HTML report: ${htmlPath}\n`));
      }
      if (result.baselineUpdated) {
        process.stderr.write(pc.dim(`Baselines updated for "${result.suite}".\n`));
      }
    }

    if (reporters.has('json')) {
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    }

    // Persist the run so `promptslay report` can re-render it later.
    const lastRunPath = join(cwd, LAST_RUN_FILE);
    await mkdir(dirname(lastRunPath), { recursive: true });
    await writeFile(lastRunPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

    const failed = results.some((r) => r.totals.failed > 0 || r.totals.errors > 0);
    const regressed = results.some((r) => r.totals.regressions > 0);
    if (failed) {
      process.exitCode = 1;
    } else if (regressed && options.failOnRegression) {
      process.stderr.write(
        pc.red('Failing run: output drift detected (--fail-on-regression).\n'),
      );
      process.exitCode = 2;
    }
  });

program
  .command('init')
  .description('Scaffold a starter suite in the current directory')
  .action(async () => {
    const { created, skipped } = await runInit(process.cwd());
    for (const file of created) process.stdout.write(`${pc.green('created')}  ${file}\n`);
    for (const file of skipped) process.stdout.write(`${pc.dim('skipped')}  ${file} (exists)\n`);
    process.stdout.write(
      `\nNext: ${pc.bold('npx promptslay run promptslay.suite.yaml')}\n`,
    );
  });

program
  .command('report')
  .description('Re-render the HTML report from a previous run')
  .argument('[runFile]', 'path to a run JSON file', LAST_RUN_FILE)
  .option('-o, --output <dir>', 'directory for the HTML report', 'promptslay-report')
  .action(async (runFile: string, options: { output: string }) => {
    let raw: string;
    try {
      raw = await readFile(runFile, 'utf8');
    } catch (error) {
      return program.error(
        `Could not read run file "${runFile}" — run \`promptslay run\` first. (${(error as Error).message})`,
      );
    }
    const parsed = JSON.parse(raw) as RunResult | RunResult[];
    const results = Array.isArray(parsed) ? parsed : [parsed];
    for (const result of results) {
      const outDir =
        results.length > 1 ? join(options.output, slugify(result.suite)) : options.output;
      const htmlPath = await writeHtmlReport(result, outDir);
      process.stdout.write(`HTML report: ${htmlPath}\n`);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(pc.red(`${error instanceof Error ? error.message : String(error)}\n`));
  process.exitCode = 1;
});
