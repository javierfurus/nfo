import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { pollPermissions } from '../../src/tui/poll-permission.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';
import { execa } from 'execa';
import type { OrchestraState } from '../../src/state.types.js';

// A realistic claude permission-prompt block that satisfies all three detector signals:
//   1. An intro line matching /allow\s+\S+/i
//   2. A numbered choice starting with "1." (yes-line)
//   3. A numbered choice starting with "3." containing "No" (no-line)
const PERMISSION_PROMPT_TEXT = [
  'Allow Bash to run `ls`?',
  '',
  ' 1. Yes',
  ' 2. Yes, and don\'t ask again for Bash commands',
  ' 3. No, and tell Claude what to do differently',
  '',
  '❯ 1',
].join('\n');

describe('pollPermissions', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  // Helper: build a minimal OrchestraState with a single musician fixture.
  function makeStateWithMusician(
    orchId: string,
    projectPath: string,
    musicianStatus: OrchestraState['musicians'][number]['status'],
    windowId: string,
  ): OrchestraState {
    const base = makeInitialState({ orchestraId: orchId, projectPath, permissionLevel: 'supervised' });
    base.musicians.push({
      id: 'mus-001',
      name: 'x',
      task_summary: 't',
      status: musicianStatus,
      pending_permission: null,
      tmux_window_id: windowId,
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });
    return base;
  }

  it('transitions working → awaiting_permission when pane shows a permission prompt', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    // Create a new window and capture its id.
    const { stdout: winIdRaw } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-perm', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    const winId = winIdRaw.trim();

    // Write the permission-prompt text into the pane using printf (literal, no Enter needed).
    await execa('tmux', ['send-keys', '-l', '-t', `${sess}:${winId}`, '--', PERMISSION_PROMPT_TEXT]);
    // Give tmux time to render the output.
    await new Promise((r) => { setTimeout(r, 250); });

    const state = makeStateWithMusician(orchId, repo.path, 'working', winId);
    await writeState(orchId, state);

    const transitions = await pollPermissions(state);

    expect(transitions).toHaveLength(1);
    expect(transitions[0].musicianId).toBe('mus-001');
    expect(transitions[0].newStatus).toBe('awaiting_permission');
    expect(transitions[0].pendingPermission).not.toBeNull();
    expect(transitions[0].pendingPermission!.startsWith('Bash')).toBe(true);
  });

  it('transitions awaiting_permission → working when pane is cleared', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const { stdout: winIdRaw } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-clear', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    const winId = winIdRaw.trim();

    // Clear the pane so no permission-prompt signals are present.
    await execa('tmux', ['send-keys', '-t', `${sess}:${winId}`, 'clear', 'Enter']);
    await new Promise((r) => { setTimeout(r, 250); });

    // Musician is currently marked awaiting_permission but pane is clean.
    const state = makeStateWithMusician(orchId, repo.path, 'awaiting_permission', winId);
    await writeState(orchId, state);

    const transitions = await pollPermissions(state);

    expect(transitions).toHaveLength(1);
    expect(transitions[0].musicianId).toBe('mus-001');
    expect(transitions[0].newStatus).toBe('working');
    expect(transitions[0].pendingPermission).toBeNull();
  });

  it('emits no transition for a stopped musician', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    // No real session needed — stopped musicians are skipped before any I/O.
    const state = makeStateWithMusician(orchId, repo.path, 'stopped', '@0');
    await writeState(orchId, state);

    const transitions = await pollPermissions(state);

    expect(transitions).toHaveLength(0);
  });

  it('swallows errors for a non-existent window and emits no transition', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    // Musician points at a window id that will never exist.
    const state = makeStateWithMusician(orchId, repo.path, 'working', '@9999');
    await writeState(orchId, state);

    let thrown = false;
    let transitions: Awaited<ReturnType<typeof pollPermissions>> = [];
    try {
      transitions = await pollPermissions(state);
    } catch {
      thrown = true;
    }

    expect(thrown).toBe(false);
    expect(transitions).toHaveLength(0);
  });

  it('emits no transition when state already matches (awaiting + prompt still visible)', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);

    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const { stdout: winIdRaw } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-noop', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    const winId = winIdRaw.trim();

    // Write the prompt so the detector fires.
    await execa('tmux', ['send-keys', '-l', '-t', `${sess}:${winId}`, '--', PERMISSION_PROMPT_TEXT]);
    await new Promise((r) => { setTimeout(r, 250); });

    // Musician is ALREADY marked awaiting_permission — no delta to emit.
    const state = makeStateWithMusician(orchId, repo.path, 'awaiting_permission', winId);
    await writeState(orchId, state);

    const transitions = await pollPermissions(state);

    expect(transitions).toHaveLength(0);
  });
});
