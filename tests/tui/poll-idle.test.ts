import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { execa } from 'execa';
import { detectIdleMusicians, hasClaudeInputPrompt, syncMusicianIdleState } from '../../src/tui/poll-idle.js';
import { ensureOrchestraDir, readState, writeState } from '../../src/state.js';
import { addMusician } from '../../src/state-updaters.js';
import { makeInitialState } from '../../src/state.types.js';
import type { Musician, OrchestraState } from '../../src/state.types.js';
import { messageMusician } from '../../src/musicians/message.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import {
  capturePane,
  createDetachedSession,
  killSession,
  sessionName,
} from '../../src/tmux.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

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

describe('syncMusicianIdleState (real tmux)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const session of sessionsToKill) {
      try { await killSession(session); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  const promptCommand = "bash -lc \"printf '\\n❯\\n'; cat\"";

  async function setup(): Promise<{ orchId: string; repoPath: string; sess: string }> {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);
    await writeState(orchId, makeInitialState({
      orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    return { orchId, repoPath: repo.path, sess };
  }

  it('flags a reported-then-silent musician as waiting once the pane is unchanged past 20s', async () => {
    const { orchId, repoPath, sess } = await setup();
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-alpha', '-c', repoPath, '-d',
      '-P', '-F', '#{window_id}',
      promptCommand,
    ]);

    const reportedAt = '2026-05-29T10:00:00Z';
    await addMusician(orchId, {
      id: 'mus-001',
      name: 'alpha',
      task_summary: 'wait for follow-up',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: reportedAt,
      last_activity: reportedAt,
      last_state_report: reportedAt,
    });

    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const before = await capturePane(`${sess}:${winId.trim()}`, 20);
    expect(hasClaudeInputPrompt(before)).toBe(true);

    // First poll establishes the unchanged-since baseline.
    const tracker = await syncMusicianIdleState(orchId, {}, '2026-05-29T10:00:01Z');
    const afterFirstPoll = await readState(orchId);
    expect(afterFirstPoll?.musicians[0].status).toBe('working');

    // 20s+ later, same signature, still a bare prompt -> waiting.
    await syncMusicianIdleState(orchId, tracker, '2026-05-29T10:00:25Z');
    const state = await readState(orchId);
    expect(state?.musicians[0].status).toBe('waiting');
  });

  it('drain wins over the waiting transition when a follow-up message is queued', async () => {
    const { orchId, repoPath, sess } = await setup();
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-alpha', '-c', repoPath, '-d',
      '-P', '-F', '#{window_id}',
      promptCommand,
    ]);

    const reportedAt = '2026-05-29T10:00:00Z';
    await addMusician(orchId, {
      id: 'mus-001',
      name: 'alpha',
      task_summary: 'wait for follow-up',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: reportedAt,
      last_activity: reportedAt,
      last_state_report: reportedAt,
    });

    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const queued = await messageMusician({
      orchestraId: orchId,
      musicianId: 'mus-001',
      message: 'echo queued-follow-up',
    });
    expect(queued.delivery).toBe('queued');

    const tracker = await syncMusicianIdleState(orchId, {}, '2026-05-29T10:00:01Z');
    await syncMusicianIdleState(orchId, tracker, '2026-05-29T10:00:25Z');
    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const out = await capturePane(`${sess}:${winId.trim()}`, 30);
    expect(out).toContain('queued-follow-up');

    const state = await readState(orchId);
    expect(state?.musicians[0].status).toBe('working');
  });

  it('bootstraps a never-reported musician to idle once BOOTSTRAP_IDLE_MS has elapsed since spawn', async () => {
    const { orchId, repoPath, sess } = await setup();
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-alpha', '-c', repoPath, '-d',
      '-P', '-F', '#{window_id}',
    ]);

    const spawnedAt = '2026-05-29T10:00:00Z';
    await addMusician(orchId, {
      id: 'mus-001',
      name: 'alpha',
      task_summary: 'never reported',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: spawnedAt,
      last_activity: spawnedAt,
      last_state_report: null,
    });

    await syncMusicianIdleState(orchId, {}, '2026-05-29T10:01:05Z');

    const state = await readState(orchId);
    expect(state?.musicians[0].status).toBe('idle');
  });
});
