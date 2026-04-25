import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTwoFilesPatch } from 'diff';

import type { RegressionInfo } from '../core/types.js';

/** One recorded output for one case. */
export interface BaselineEntry {
  output: string;
  /** Hash of (rendered prompt, model) — used to flag prompt/model drift. */
  promptHash: string;
  model: string;
  updatedAt: string;
}

export interface Baseline {
  suite: string;
  createdAt: string;
  updatedAt: string;
  entries: Record<string, BaselineEntry>;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'suite'
  );
}

/** Diff hunks read poorly for outputs without a trailing newline. */
function withTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** Unified diff of baseline vs current output for one case. */
export function renderUnifiedDiff(caseId: string, baseline: string, current: string): string {
  return createTwoFilesPatch(
    `baseline/${caseId}`,
    `current/${caseId}`,
    withTrailingNewline(baseline),
    withTrailingNewline(current),
    undefined,
    undefined,
    { context: 3 },
  );
}

/**
 * Stores one baseline file per suite under `.promptslay/baselines/`. Baselines
 * are meant to be committed, so reviewers see output drift as diffs in PRs.
 */
export class BaselineStore {
  constructor(private readonly dir: string) {}

  fileFor(suiteName: string): string {
    return join(this.dir, `${slugify(suiteName)}.json`);
  }

  async load(suiteName: string): Promise<Baseline | undefined> {
    try {
      const raw = await readFile(this.fileFor(suiteName), 'utf8');
      return JSON.parse(raw) as Baseline;
    } catch {
      return undefined;
    }
  }

  async save(baseline: Baseline): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(
      this.fileFor(baseline.suite),
      `${JSON.stringify(baseline, null, 2)}\n`,
      'utf8',
    );
  }

  /**
   * Compare one case's output against the stored baseline.
   * Returns undefined when there is no baseline entry or nothing changed.
   */
  compare(
    baseline: Baseline | undefined,
    caseId: string,
    output: string,
    promptHash: string,
  ): RegressionInfo | undefined {
    const entry = baseline?.entries[caseId];
    if (!entry || entry.output === output) return undefined;
    return {
      caseId,
      diff: renderUnifiedDiff(caseId, entry.output, output),
      baselineModel: entry.model,
      promptChanged: entry.promptHash !== promptHash,
    };
  }

  /** Build the next baseline from a run's outputs, preserving createdAt. */
  next(
    previous: Baseline | undefined,
    suiteName: string,
    outputs: Array<{ caseId: string; output: string; promptHash: string; model: string }>,
  ): Baseline {
    const now = new Date().toISOString();
    const entries: Record<string, BaselineEntry> = {};
    for (const { caseId, output, promptHash, model } of outputs) {
      entries[caseId] = { output, promptHash, model, updatedAt: now };
    }
    return {
      suite: suiteName,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      entries,
    };
  }
}
