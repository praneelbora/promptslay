/** Shared formatting helpers for reporters. */

export function formatUsd(value: number): string {
  if (value === 0) return '$0.0000';
  if (value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(4)}`;
}

export function formatMs(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(0)}%`;
}
