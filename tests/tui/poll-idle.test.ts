import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { ensureOrchestraDir, readState, writeState } from '../../src/state.js';
import { addMusician } from '../../src/state-updaters.js';
import { makeInitialState } from '../../src/state.types.js';
import { messageMusician } from '../../src/musicians/message.js';
import { messageLogsDir } from '../../src/config.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import {
  capturePane,
  createDetachedSession,
  killSession,
  sessionName,
} from '../../src/tmux.js';
import { hasClaudeInputPrompt, syncMusicianIdleState } from '../../src/tui/poll-idle.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';

describe('pollIdle', () => {
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

  it('detects the Claude input prompt only when it is near the pane bottom', () => {
    expect(hasClaudeInputPrompt([
      'Claude transcript',
      '❯ Ask alpha to wrap up',
      'Processing...',
    ].join('\n'))).toBe(false);

    expect(hasClaudeInputPrompt([
      'Completed work.',
      '────────────────────────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────────────────────────',
      '⏵⏵ bypass permissions on (shift+tab to cycle)',
    ].join('\n'))).toBe(true);
  });

  const promptCommand = "bash -lc \"printf '\\n❯\\n'; cat\"";

  it('marks a quiet musician idle when Claude is back at the prompt', async () => {
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
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-alpha', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
      promptCommand,
    ]);

    await addMusician(orchId, {
      id: 'mus-001',
      name: 'alpha',
      task_summary: 'wait for follow-up',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const before = await capturePane(`${sess}:${winId.trim()}`, 20);
    expect(hasClaudeInputPrompt(before)).toBe(true);

    await syncMusicianIdleState(orchId, {}, '2026-05-29T10:00:31Z');

    const state = await readState(orchId);
    expect(state?.musicians[0].status).toBe('idle');
  });

  it('flushes queued messages once a working musician is visibly idle', async () => {
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
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-alpha', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
      promptCommand,
    ]);

    await addMusician(orchId, {
      id: 'mus-001',
      name: 'alpha',
      task_summary: 'wait for follow-up',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const queued = await messageMusician({
      orchestraId: orchId,
      musicianId: 'mus-001',
      message: 'echo idle-drain-test',
    });
    expect(queued.delivery).toBe('queued');

    await syncMusicianIdleState(orchId, {}, '2026-05-29T10:00:31Z');
    await new Promise((resolve) => { setTimeout(resolve, 250); });

    const out = await capturePane(`${sess}:${winId.trim()}`, 30);
    expect(out).toContain('idle-drain-test');

    const state = await readState(orchId);
    expect(state?.musicians[0].status).toBe('working');

    const log = await readFile(join(messageLogsDir(orchId), 'mus-001.jsonl'), 'utf8');
    expect(log).toContain('"type":"message_delivered"');
  });
});
