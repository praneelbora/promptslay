import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CaseResult, RunResult } from '../core/types.js';
import { formatMs, formatPercent, formatTokens, formatUsd } from './format.js';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem;
         background: #f6f7f9; color: #1c2128; }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } }
  main { max-width: 64rem; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .meta { color: #768390; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem;
           margin-bottom: 1.5rem; }
  .card { background: rgba(127,127,127,0.08); border: 1px solid rgba(127,127,127,0.2);
          border-radius: 8px; padding: 0.75rem 1rem; }
  .card .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #768390; }
  .card .value { font-size: 1.25rem; font-weight: 600; margin-top: 0.15rem; }
  .ok { color: #2da44e; } .bad { color: #cf222e; } .warn { color: #bf8700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.5rem 0.65rem; border-bottom: 1px solid rgba(127,127,127,0.2); }
  th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #768390; }
  details { margin: 0.6rem 0; border: 1px solid rgba(127,127,127,0.25); border-radius: 8px; }
  summary { cursor: pointer; padding: 0.6rem 0.9rem; font-weight: 600; }
  .case-body { padding: 0 0.9rem 0.9rem; }
  pre { background: rgba(127,127,127,0.1); border-radius: 6px; padding: 0.75rem; overflow-x: auto;
        font-size: 0.8rem; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .diff-add { color: #2da44e; } .diff-del { color: #cf222e; }
  .grade { display: flex; gap: 0.5rem; align-items: baseline; margin: 0.25rem 0; font-size: 0.85rem; }
  .pill { display: inline-block; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem;
          font-weight: 600; }
  .pill.pass { background: rgba(45,164,78,0.15); color: #2da44e; }
  .pill.fail, .pill.error { background: rgba(207,34,46,0.15); color: #cf222e; }
  .pill.drift { background: rgba(191,135,0,0.15); color: #bf8700; }
  footer { margin-top: 2rem; color: #768390; font-size: 0.8rem; }
`;

function statusPill(result: CaseResult): string {
  if (result.error !== undefined) return '<span class="pill error">error</span>';
  return result.passed
    ? '<span class="pill pass">pass</span>'
    : '<span class="pill fail">fail</span>';
}

function renderDiffHtml(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (line.startsWith('+')) return `<span class="diff-add">${escaped}</span>`;
      if (line.startsWith('-')) return `<span class="diff-del">${escaped}</span>`;
      return escaped;
    })
    .join('\n');
}

function renderCase(result: CaseResult): string {
  const grades = result.grades
    .map(
      (g) => `
      <div class="grade">
        <span class="pill ${g.passed ? 'pass' : 'fail'}">${g.passed ? 'pass' : 'fail'}</span>
        <strong>${escapeHtml(g.grader)}</strong>
        <span>score ${g.score.toFixed(2)}</span>
        ${g.message !== undefined ? `<span>— ${escapeHtml(g.message)}</span>` : ''}
      </div>`,
    )
    .join('');

  const regression =
    result.regression !== undefined
      ? `<h4>Drift vs baseline (${escapeHtml(result.regression.baselineModel)}${
          result.regression.promptChanged ? ', prompt changed' : ''
        })</h4><pre>${renderDiffHtml(result.regression.diff)}</pre>`
      : '';

  return `
  <details ${result.passed && result.regression === undefined ? '' : 'open'}>
    <summary>${statusPill(result)} ${
      result.regression !== undefined ? '<span class="pill drift">drift</span> ' : ''
    }${escapeHtml(result.caseId)}
      <span style="float:right;font-weight:400;color:#768390">
        ${formatUsd(result.costUsd)} · ${formatMs(result.latencyMs)}${result.cached ? ' (cached)' : ''}
      </span>
    </summary>
    <div class="case-body">
      ${result.error !== undefined ? `<pre class="bad">${escapeHtml(result.error)}</pre>` : ''}
      ${result.output !== '' ? `<h4>Output</h4><pre>${escapeHtml(result.output)}</pre>` : ''}
      ${grades !== '' ? `<h4>Grades</h4>${grades}` : ''}
      ${regression}
    </div>
  </details>`;
}

/** Render a fully self-contained HTML report (no external assets). */
export function renderHtmlReport(result: RunResult): string {
  const t = result.totals;
  const cards = [
    {
      label: 'Pass rate',
      value: `${t.passed}/${t.cases} (${formatPercent(t.passed, t.cases)})`,
      cls: t.failed + t.errors > 0 ? 'bad' : 'ok',
    },
    { label: 'Drift', value: String(t.regressions), cls: t.regressions > 0 ? 'warn' : 'ok' },
    { label: 'Cost', value: formatUsd(t.costUsd), cls: '' },
    {
      label: 'Tokens in/out',
      value: `${formatTokens(t.inputTokens)} / ${formatTokens(t.outputTokens)}`,
      cls: '',
    },
    { label: 'Avg latency', value: formatMs(t.avgLatencyMs), cls: '' },
    { label: 'Cache hits', value: `${t.cacheHits}/${t.cases}`, cls: '' },
  ]
    .map(
      (card) => `
      <div class="card">
        <div class="label">${card.label}</div>
        <div class="value ${card.cls}">${escapeHtml(card.value)}</div>
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>promptslay · ${escapeHtml(result.suite)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>promptslay · ${escapeHtml(result.suite)}</h1>
  <div class="meta">${escapeHtml(result.provider)} · ${escapeHtml(result.model)} · ${escapeHtml(
    result.startedAt,
  )} · ${formatMs(result.durationMs)}</div>
  <div class="cards">${cards}</div>
  ${result.cases.map((c) => renderCase(c)).join('\n')}
  <footer>Generated by promptslay — unit tests for your prompts.</footer>
</main>
</body>
</html>
`;
}

/** Write `index.html` (+ raw `run.json`) into `outDir`; returns the html path. */
export async function writeHtmlReport(result: RunResult, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const htmlPath = join(outDir, 'index.html');
  await writeFile(htmlPath, renderHtmlReport(result), 'utf8');
  await writeFile(join(outDir, 'run.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return htmlPath;
}
