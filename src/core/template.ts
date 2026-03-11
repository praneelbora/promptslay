import type { PromptTemplate, RenderedPrompt } from './types.js';

const PLACEHOLDER = /\{\{\s*([\w$][\w$.-]*)\s*\}\}/g;

export class MissingVariableError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing template variable "${variable}"`);
    this.name = 'MissingVariableError';
    this.variable = variable;
  }
}

function lookup(vars: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, vars);
}

function stringify(value: unknown): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Substitute `{{variable}}` placeholders. Dot paths (`{{user.name}}`) are
 * supported. Throws {@link MissingVariableError} when a referenced variable
 * is undefined, so typos fail loudly instead of producing silent prompts.
 */
export function renderTemplate(template: string, vars: Record<string, unknown> = {}): string {
  return template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = lookup(vars, path);
    if (value === undefined) throw new MissingVariableError(path);
    return stringify(value);
  });
}

/** Render both halves of a prompt template. */
export function renderPrompt(
  prompt: PromptTemplate,
  vars: Record<string, unknown> = {},
): RenderedPrompt {
  return {
    ...(prompt.system !== undefined ? { system: renderTemplate(prompt.system, vars) } : {}),
    user: renderTemplate(prompt.user, vars),
  };
}

/** List the distinct variable names referenced by a template. */
export function extractVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    names.add(match[1] as string);
  }
  return [...names];
}
