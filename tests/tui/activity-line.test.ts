import { describe, it, expect } from 'vitest';
import { extractActivityLine } from '../../src/tui/activity-line.js';

describe('extractActivityLine', () => {
  it('returns the last non-empty trimmed line', () => {
    const pane = 'first line\nsecond line\n\n   \nthird line\n\n';
    expect(extractActivityLine(pane)).toBe('third line');
  });
  it('returns empty string for all-blank input', () => {
    expect(extractActivityLine('\n  \n\t\n')).toBe('');
  });
  it('truncates very long lines to 60 chars with an ellipsis', () => {
    const long = 'x'.repeat(100);
    const out = extractActivityLine(long);
    expect(out.length).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });
  it('handles empty string', () => {
    expect(extractActivityLine('')).toBe('');
  });
});
