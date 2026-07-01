import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addMusician,
  setMusicianStatus,
  archiveMusician,
  setOrchestratorSessionId,
  setMusicianClaudeSessionId,
  setMusicianTmuxWindowId,
  touchMusicianActivity,
  setMusicianState,
  truncateDetail,
} from '../src/state-updaters.js';
import { ensureOrchestraDir, writeState, readState } from '../src/state.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';
import { makeTmpRepo } from './helpers/tmp-repo.js';
import { projectKeyFromPath } from '../src/project-key.js';
import type { Musician } from '../src/state.types.js';

describe('state updaters', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  async function freshState(id: string) {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir(id);
    await writeState(id, makeInitialState({
      orchestraId: id, projectPath: '/tmp/x', permissionLevel: 'supervised',
    }));
  }

  it('addMusician appends a working musician', async () => {
    await freshState('orch-a');
    await addMusician('orch-a', {
      id: 'mus-001',
      name: 'tester',
      task_summary: 'run tests',
      status: 'working',
      tmux_window_id: '@1',
      claude_session_id: null,
      worktree_path: '/tmp/w',
      branch: 'nfo/mus-001',
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });
    const state = await readState('orch-a');
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].id).toBe('mus-001');
  });

  it('setMusicianStatus updates only that musician', async () => {
    await freshState('orch-b');
    await addMusician('orch-b', baseMus('mus-001'));
    await addMusician('orch-b', baseMus('mus-002'));

    await setMusicianStatus('orch-b', 'mus-001', 'idle');

    const state = await readState('orch-b');
    expect(state!.musicians.find(m => m.id === 'mus-001')!.status).toBe('idle');
    expect(state!.musicians.find(m => m.id === 'mus-002')!.status).toBe('working');
  });

  it('archiveMusician moves the musician to archived_musicians with summary + timestamp', async () => {
    await freshState('orch-c');
    await addMusician('orch-c', baseMus('mus-001'));

    await archiveMusician('orch-c', 'mus-001', { summary: 'done', dismissedAt: '2026-05-29T11:00:00Z' });

    const state = await readState('orch-c');
    expect(state!.musicians).toHaveLength(0);
    expect(state!.archived_musicians).toHaveLength(1);
    expect(state!.archived_musicians[0].id).toBe('mus-001');
    expect(state!.archived_musicians[0].dismissed_at).toBe('2026-05-29T11:00:00Z');
    expect(state!.archived_musicians[0].summary).toBe('done');
    expect(state!.archived_musicians[0].status).toBe('stopped');
  });

  it('setOrchestratorSessionId records the session id', async () => {
    await freshState('orch-d');
    await setOrchestratorSessionId('orch-d', 'sess-abc');
    const state = await readState('orch-d');
    expect(state!.orchestrator_session_id).toBe('sess-abc');
  });

  it('setMusicianClaudeSessionId records the session id', async () => {
    await freshState('orch-e');
    await addMusician('orch-e', baseMus('mus-001'));
    await setMusicianClaudeSessionId('orch-e', 'mus-001', 'sess-xyz');
    const state = await readState('orch-e');
    expect(state!.musicians[0].claude_session_id).toBe('sess-xyz');
  });

  it('touchMusicianActivity updates last_activity', async () => {
    await freshState('orch-f');
    await addMusician('orch-f', baseMus('mus-001'));
    await touchMusicianActivity('orch-f', 'mus-001', '2026-05-29T12:00:00Z');
    const state = await readState('orch-f');
    expect(state!.musicians[0].last_activity).toBe('2026-05-29T12:00:00Z');
  });

  it('setMusicianTmuxWindowId records the window id', async () => {
    await freshState('orch-g');
    await addMusician('orch-g', baseMus('mus-001'));
    await setMusicianTmuxWindowId('orch-g', 'mus-001', '@42');
    const state = await readState('orch-g');
    expect(state!.musicians[0].tmux_window_id).toBe('@42');
  });
});

function mus(over: Partial<Musician>): Musician {
  return {
    id: 'mus-001', name: 'tester', task_summary: 't', status: 'working',
    tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
    spawned_at: '2026-07-01T10:00:00Z', last_activity: '2026-07-01T10:00:00Z',
    ...over,
  };
}

describe('setMusicianState', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  async function setup(): Promise<string> {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);
    await writeState(orchId, makeInitialState({
      orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised',
    }));
    return orchId;
  }

  it('truncateDetail caps at 100 chars with an ellipsis', () => {
    expect(truncateDetail('short')).toBe('short');
    const long = 'x'.repeat(150);
    const out = truncateDetail(long);
    expect(out.length).toBe(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('sets working + stores detail + stamps last_state_report', async () => {
    const orchId = await setup();
    await addMusician(orchId, mus({ id: 'mus-001', status: 'idle' }));
    const stored = await setMusicianState(orchId, 'mus-001', 'running tests', '2026-07-01T10:05:00Z');
    expect(stored).toBe('running tests');
    const state = await readState(orchId);
    const m = state!.musicians[0];
    expect(m.status).toBe('working');
    expect(m.detail).toBe('running tests');
    expect(m.last_state_report).toBe('2026-07-01T10:05:00Z');
    expect(m.last_activity).toBe('2026-07-01T10:05:00Z');
  });
});

function baseMus(id: string) {
  return {
    id,
    name: 'm',
    task_summary: 't',
    status: 'working' as const,
    tmux_window_id: '@0',
    claude_session_id: null,
    worktree_path: null,
    branch: null,
    spawned_at: '2026-05-29T10:00:00Z',
    last_activity: '2026-05-29T10:00:00Z',
  };
}
