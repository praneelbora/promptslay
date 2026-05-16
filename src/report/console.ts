import pc from 'picocolors';

import type { CaseResult, RunResult } from '../core/types.js';
import { formatMs, formatPercent, formatTokens, formatUsd } from './format.js';

export interface ConsoleReportOptions {
  /** Force colors on/off. Default: picocolors auto-detection. */
  colors?: boolean;
  /** Print unified diffs for regressed cases. Default true. */
  diffs?: boolean;
}

type Colorizer = (text: string) => string;

interface Palette {
  green: Colorizer;
  red: Colorizer;
  yellow: Colorizer;
  dim: Colorizer;
  bold: Colorizer;
  cyan: Colorizer;
}

function paletteFor(options: ConsoleReportOptions): Palette {
  const enabled = options.colors ?? pc.isColorSupported;
  const c = pc.createColors(enabled);
  return { green: c.green, red: c.red, yellow: c.yellow, dim: c.dim, bold: c.bold, cyan: c.cyan };
}

function statusOf(result: CaseResult): 'pass' | 'fail' | 'error' {
  if (result.error !== undefined) return 'error';
  return result.passed ? 'pass' : 'fail';
}

function meanScore(result: CaseResult): string {
  if (result.grades.length === 0) return '—';
  const mean = result.grades.reduce((sum, g) => sum + g.score, 0) / result.grades.length;
  return mean.toFixed(2);
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;
const visibleWidth = (text: string) => text.replace(ANSI, '').length;

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
}

function renderTable(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visibleWidth(cell));
    });
  }
  return rows.map((row) => row.map((cell, i) => pad(cell, widths[i] as number)).join('  ').trimEnd());
}

/** Render the run summary table (returned as a string so it's testable). */
export function renderConsoleReport(result: RunResult, options: ConsoleReportOptions = {}): string {
  const c = paletteFor(options);
  const lines: string[] = [];

  lines.push('');
  lines.push(
    `${c.bold(result.suite)} ${c.dim(`(${result.provider} · ${result.model})`)}`,
  );
  lines.push('');

  const rows: string[][] = [
    ['CASE', 'STATUS', 'SCORE', 'COST', 'LATENCY', 'DRIFT'].map((h) => c.dim(h)),
  ];
  for (const caseResult of result.cases) {
    const status = statusOf(caseResult);
    const statusCell =
      status === 'pass' ? c.green('✓ pass') : status === 'fail' ? c.red('✗ fail') : c.red('! error');
    const latency = caseResult.cached
      ? c.dim(`${formatMs(caseResult.latencyMs)} (cached)`)
      : formatMs(caseResult.latencyMs);
    const drift = caseResult.regression !== undefined ? c.yellow('drift') : c.dim('—');
    rows.push([caseResult.caseId, statusCell, meanScore(caseResult), formatUsd(caseResult.costUsd), latency, drift]);
  }
  lines.push(...renderTable(rows));

  // Failure details under the table.
  for (const caseResult of result.cases) {
    if (caseResult.error !== undefined) {
      lines.push('', c.red(`  ${caseResult.caseId}: ${caseResult.error}`));
      continue;
    }
    for (const grade of caseResult.grades) {
      if (!grade.passed && grade.message !== undefined) {
        lines.push('', c.red(`  ${caseResult.caseId} › ${grade.grader}: ${grade.message}`));
      }
    }
  }

  // Regression diffs.
  if ((options.diffs ?? true) && result.totals.regressions > 0) {
    lines.push('', c.yellow(c.bold(`Output drift detected (${result.totals.regressions} case${result.totals.regressions === 1 ? '' : 's'}):`)));
    for (const caseResult of result.cases) {
      if (caseResult.regression === undefined) continue;
      lines.push('', c.yellow(`  ── ${caseResult.caseId} (baseline: ${caseResult.regression.baselineModel}${caseResult.regression.promptChanged ? ', prompt changed' : ''}) ──`));
      for (const diffLine of caseResult.regression.diff.split('\n')) {
        const colored = diffLine.startsWith('+')
          ? c.green(diffLine)
          : diffLine.startsWith('-')
            ? c.red(diffLine)
            : c.dim(diffLine);
        lines.push(`  ${colored}`);
      }
    }
    lines.push('', c.dim('  Intentional change? Re-run with --update-baselines to accept.'));
  }

  const t = result.totals;
  const summaryColor = t.failed + t.errors > 0 ? c.red : c.green;
  lines.push(
    '',
    summaryColor(
      c.bold(
        `${t.passed}/${t.cases} passed (${formatPercent(t.passed, t.cases)})` +
          (t.failed > 0 ? `, ${t.failed} failed` : '') +
          (t.errors > 0 ? `, ${t.errors} errored` : '') +
          (t.regressions > 0 ? `, ${t.regressions} drifted` : ''),
      ),
    ),
    c.dim(
      `cost ${formatUsd(t.costUsd)} · tokens ${formatTokens(t.inputTokens)} in / ${formatTokens(t.outputTokens)} out · avg latency ${formatMs(t.avgLatencyMs)} · cache hits ${t.cacheHits}/${t.cases} · wall ${formatMs(result.durationMs)}`,
    ),
    '',
  );

  return lines.join('\n');
}
