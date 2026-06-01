import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addMusician,
  setMusicianStatus,
  archiveMusician,
  setOrchestratorSessionId,
  setMusicianClaudeSessionId,
  setMusicianTmuxWindowId,
  touchMusicianActivity,
} from '../src/state-updaters.js';
import { ensureOrchestraDir, writeState, readState } from '../src/state.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';

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
