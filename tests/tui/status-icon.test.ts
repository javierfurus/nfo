import { describe, it, expect } from 'vitest';
import { statusIcon, statusColor } from '../../src/tui/status-icon.js';
import type { MusicianStatus } from '../../src/state.types.js';

describe('statusIcon', () => {
  it('maps each status to an icon', () => {
    expect(statusIcon('working')).toBe('●');
    expect(statusIcon('idle')).toBe('◐');
    expect(statusIcon('awaiting_permission')).toBe('⚠');
    expect(statusIcon('stopped')).toBe('○');
  });
});

describe('statusColor', () => {
  it('maps each status to an ink color name', () => {
    const colors: Record<MusicianStatus, string> = {
      working: statusColor('working'),
      idle: statusColor('idle'),
      awaiting_permission: statusColor('awaiting_permission'),
      stopped: statusColor('stopped'),
    };
    expect(colors.working).toBe('green');
    expect(colors.idle).toBe('yellow');
    expect(colors.awaiting_permission).toBe('red');
    expect(colors.stopped).toBe('gray');
  });
});
