import { describe, expect, it } from 'vitest';

import {
  extractVariables,
  MissingVariableError,
  renderPrompt,
  renderTemplate,
} from '../src/core/template.js';

describe('renderTemplate', () => {
  it('substitutes simple variables', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'Ada' })).toBe('Hello Ada!');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('Hello {{  name  }}!', { name: 'Ada' })).toBe('Hello Ada!');
  });

  it('substitutes the same variable multiple times', () => {
    expect(renderTemplate('{{x}} and {{x}}', { x: 'twice' })).toBe('twice and twice');
  });

  it('resolves dot paths', () => {
    expect(renderTemplate('{{user.name}} <{{user.email}}>', {
      user: { name: 'Ada', email: 'ada@example.com' },
    })).toBe('Ada <ada@example.com>');
  });

  it('stringifies numbers and booleans', () => {
    expect(renderTemplate('{{n}} {{ok}}', { n: 42, ok: true })).toBe('42 true');
  });

  it('JSON-encodes objects and arrays', () => {
    expect(renderTemplate('{{items}}', { items: [1, 2] })).toBe('[1,2]');
  });

  it('renders null as empty string', () => {
    expect(renderTemplate('[{{gone}}]', { gone: null })).toBe('[]');
  });

  it('throws on missing variables', () => {
    expect(() => renderTemplate('Hello {{nope}}', {})).toThrow(MissingVariableError);
    expect(() => renderTemplate('Hello {{nope}}', {})).toThrow(/nope/);
  });

  it('throws on missing nested paths', () => {
    expect(() => renderTemplate('{{user.name}}', { user: {} })).toThrow(MissingVariableError);
  });

  it('leaves non-placeholder braces alone', () => {
    expect(renderTemplate('JSON looks like {"a": 1}', {})).toBe('JSON looks like {"a": 1}');
  });
});

describe('renderPrompt', () => {
  it('renders system and user halves', () => {
    const rendered = renderPrompt(
      { system: 'You are {{persona}}.', user: 'Hi, I am {{name}}.' },
      { persona: 'a pirate', name: 'Ada' },
    );
    expect(rendered).toEqual({ system: 'You are a pirate.', user: 'Hi, I am Ada.' });
  });

  it('omits system when the template has none', () => {
    expect(renderPrompt({ user: 'plain' }, {})).toEqual({ user: 'plain' });
  });
});

describe('extractVariables', () => {
  it('lists distinct variable names', () => {
    expect(extractVariables('{{a}} {{b.c}} {{a}}')).toEqual(['a', 'b.c']);
  });

  it('returns empty for static templates', () => {
    expect(extractVariables('no vars here')).toEqual([]);
  });
});
