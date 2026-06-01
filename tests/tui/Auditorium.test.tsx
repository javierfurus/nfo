import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Auditorium } from '../../src/tui/Auditorium.js';
import type { Musician } from '../../src/state.types.js';

function mus(over: Partial<Musician>): Musician {
  return {
    id: 'mus-001', name: 'tester', task_summary: 't', status: 'working',
    tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
    spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
    ...over,
  };
}

describe('Auditorium', () => {
  it('renders one row per musician with name and activity', () => {
    const musicians = [
      mus({ id: 'mus-001', name: 'alpha' }),
      mus({ id: 'mus-002', name: 'beta', status: 'idle' }),
    ];
    const activity = { 'mus-001': 'Running tests', 'mus-002': 'done' };
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={activity} selectedIndex={0} now="2026-05-29T10:02:00Z" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('orchestrator');
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
    expect(frame).toContain('Running tests');
  });
  it('marks the selected target row', () => {
    const musicians = [mus({ id: 'mus-001', name: 'alpha' })];
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={{}} selectedIndex={1} now="2026-05-29T10:02:00Z" />,
    );
    expect(lastFrame() ?? '').toContain('▸');
  });
  it('shows the orchestrator row and an empty-state message when there are no musicians', () => {
    const { lastFrame } = render(
      <Auditorium musicians={[]} activity={{}} selectedIndex={0} now="2026-05-29T10:02:00Z" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('orchestrator');
    expect(frame).toContain('No musicians');
  });
  it('renders awaiting: <tool> and ⚠ when status is awaiting_permission with a pending_permission', () => {
    const musicians = [
      mus({ id: 'mus-001', name: 'alpha', status: 'awaiting_permission', pending_permission: 'Bash: `rm -rf foo`', last_activity: '2026-05-29T10:00:00Z' }),
    ];
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={{}} selectedIndex={1} now="2026-05-29T10:02:00Z" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('awaiting: Bash:');
    expect(frame).toContain('⚠');
  });
  it('renders awaiting: tool when status is awaiting_permission with null pending_permission', () => {
    const musicians = [
      mus({ id: 'mus-001', name: 'alpha', status: 'awaiting_permission', pending_permission: null, last_activity: '2026-05-29T10:00:00Z' }),
    ];
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={{}} selectedIndex={1} now="2026-05-29T10:02:00Z" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('awaiting: tool');
  });
});
