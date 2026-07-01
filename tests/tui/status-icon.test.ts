import { describe, it, expect } from 'vitest';
import { statusIcon, statusColor } from '../../src/tui/status-icon.js';

describe('status-icon', () => {
  it('maps working to a green filled dot', () => {
    expect(statusIcon('working')).toBe('●');
    expect(statusColor('working')).toBe('green');
  });
  it('maps waiting to a yellow half dot', () => {
    expect(statusIcon('waiting')).toBe('◐');
    expect(statusColor('waiting')).toBe('yellow');
  });
  it('maps idle to a gray hollow dot', () => {
    expect(statusIcon('idle')).toBe('○');
    expect(statusColor('idle')).toBe('gray');
  });
  it('maps awaiting_permission to a red warning', () => {
    expect(statusIcon('awaiting_permission')).toBe('⚠');
    expect(statusColor('awaiting_permission')).toBe('red');
  });
  it('maps stopped to a gray hollow dot', () => {
    expect(statusIcon('stopped')).toBe('○');
    expect(statusColor('stopped')).toBe('gray');
  });
});
