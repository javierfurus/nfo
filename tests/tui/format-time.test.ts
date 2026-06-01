import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/tui/format-time.js';

const NOW = '2026-05-29T12:00:00Z';

describe('formatRelativeTime', () => {
  it('shows <1s for sub-second deltas', () => {
    expect(formatRelativeTime('2026-05-29T11:59:59.500Z', NOW)).toBe('<1s');
  });
  it('shows seconds', () => {
    expect(formatRelativeTime('2026-05-29T11:59:52Z', NOW)).toBe('8s');
  });
  it('shows minutes', () => {
    expect(formatRelativeTime('2026-05-29T11:58:00Z', NOW)).toBe('2m');
  });
  it('shows hours', () => {
    expect(formatRelativeTime('2026-05-29T09:00:00Z', NOW)).toBe('3h');
  });
  it('shows days', () => {
    expect(formatRelativeTime('2026-05-27T12:00:00Z', NOW)).toBe('2d');
  });
  it('returns ? for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('?');
  });
});
