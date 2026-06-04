import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ConcertHall } from '../../src/tui/components/ConcertHall.js';
import type { OrchestraSummary } from '../../src/commands/list.js';

function orch(over: Partial<OrchestraSummary>): OrchestraSummary {
  return {
    id: 'aaa-one', project_path: '/tmp/one', permission_level: 'supervised',
    created_at: '2026-05-29T10:00:00Z', running: true, musician_count: 2, ...over,
  };
}

describe('ConcertHall', () => {
  it('lists orchestras and marks the current one', () => {
    const list = [orch({ id: 'aaa-one' }), orch({ id: 'bbb-two', running: false })];
    const { lastFrame } = render(<ConcertHall orchestras={list} currentId="aaa-one" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('aaa-one');
    expect(frame).toContain('bbb-two');
    expect(frame).toContain('▸');
  });
});
