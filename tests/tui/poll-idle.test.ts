import { describe, it, expect } from 'vitest';
import { detectIdleMusicians } from '../../src/tui/poll-idle.js';
import { makeInitialState } from '../../src/state.types.js';
import type { Musician, OrchestraState } from '../../src/state.types.js';

function mus(over: Partial<Musician>): Musician {
  return {
    id: 'mus-001', name: 'tester', task_summary: 't', status: 'working',
    tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
    spawned_at: '2026-07-01T10:00:00Z', last_activity: '2026-07-01T10:00:00Z',
    ...over,
  };
}

function stateWith(musicians: Musician[]): OrchestraState {
  const s = makeInitialState({
    orchestraId: 'orch', projectPath: '/tmp/x', permissionLevel: 'supervised',
  });
  s.musicians = musicians;
  return s;
}

const barePrompt = 'some output\n❯\n';

describe('detectIdleMusicians', () => {
  it('bootstraps a never-reported musician to idle after 60s', () => {
    const state = stateWith([mus({ spawned_at: '2026-07-01T10:00:00Z', last_state_report: null })]);
    const { transitions } = detectIdleMusicians(state, {}, {}, '2026-07-01T10:01:05Z');
    expect(transitions).toEqual([{ id: 'mus-001', status: 'idle' }]);
  });

  it('does NOT bootstrap before 60s', () => {
    const state = stateWith([mus({ spawned_at: '2026-07-01T10:00:00Z', last_state_report: null })]);
    const { transitions } = detectIdleMusicians(state, {}, {}, '2026-07-01T10:00:30Z');
    expect(transitions).toEqual([]);
  });

  it('flags a reported-then-silent musician to waiting after 20s at a bare prompt', () => {
    const reportedAt = '2026-07-01T10:00:00Z';
    const state = stateWith([mus({ last_state_report: reportedAt, last_activity: reportedAt })]);
    const panes = { 'mus-001': barePrompt };
    // First poll establishes the unchanged-since baseline.
    const first = detectIdleMusicians(state, panes, {}, '2026-07-01T10:00:01Z');
    expect(first.transitions).toEqual([]);
    // 20s+ later, same signature, still a bare prompt -> waiting.
    const second = detectIdleMusicians(state, panes, first.nextTracker, '2026-07-01T10:00:25Z');
    expect(second.transitions).toEqual([{ id: 'mus-001', status: 'waiting' }]);
  });

  it('does not flag a reported musician that is actively generating (no bare prompt)', () => {
    const state = stateWith([mus({ last_state_report: '2026-07-01T10:00:00Z' })]);
    const panes = { 'mus-001': 'working... esc to interrupt' };
    const { transitions } = detectIdleMusicians(state, panes, {}, '2026-07-01T10:05:00Z');
    expect(transitions).toEqual([]);
  });
});
