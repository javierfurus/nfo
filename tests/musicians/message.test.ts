import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { messageMusician } from '../../src/musicians/message.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { addMusician } from '../../src/state-updaters.js';
import {
  createDetachedSession,
  sessionName,
  killSession,
  capturePane,
} from '../../src/tmux.js';
import { execa } from 'execa';
import { messageLogsDir } from '../../src/config.js';

describe('messageMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('throws when musician is unknown', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const id = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(id);
    await writeState(id, makeInitialState({
      orchestraId: id, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    await expect(
      messageMusician({ orchestraId: id, musicianId: 'mus-999', message: 'hi' }),
    ).rejects.toThrow(/Unknown musician/);
  });

  it("sends keys + Enter immediately when the musician is idle", async () => {
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
      'new-window', '-t', sess, '-n', 'mus-001-tester', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);

    await addMusician(orchId, {
      id: 'mus-001',
      name: 'tester',
      task_summary: 't',
      status: 'idle',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    const result = await messageMusician({
      orchestraId: orchId,
      musicianId: 'mus-001',
      message: 'echo nfo-message-test',
    });
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${sess}:${winId.trim()}`, 20);
    expect(out).toContain('nfo-message-test');
    expect(result.delivery).toBe('immediate');
    expect(result.pending_messages).toBe(0);

    const state = await readState(orchId);
    expect(state!.musicians[0].last_activity).not.toBe('2026-05-29T10:00:00Z');
    expect(state!.musicians[0].status).toBe('working');

    const log = await readFile(join(messageLogsDir(orchId), 'mus-001.jsonl'), 'utf8');
    expect(log).toContain('"type":"message_queued"');
    expect(log).toContain('"type":"message_delivered"');
  });

  it('queues follow-up work when the musician is still working', async () => {
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
      'new-window', '-t', sess, '-n', 'mus-001-tester', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);

    await addMusician(orchId, {
      id: 'mus-001',
      name: 'tester',
      task_summary: 't',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    const result = await messageMusician({
      orchestraId: orchId,
      musicianId: 'mus-001',
      message: 'echo should-not-run-yet',
    });
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${sess}:${winId.trim()}`, 20);
    expect(out).not.toContain('should-not-run-yet');
    expect(result.delivery).toBe('queued');
    expect(result.pending_messages).toBe(1);

    const state = await readState(orchId);
    expect(state!.musicians[0].last_activity).toBe('2026-05-29T10:00:00Z');

    const log = await readFile(join(messageLogsDir(orchId), 'mus-001.jsonl'), 'utf8');
    expect(log).toContain('"type":"message_queued"');
    expect(log).not.toContain('"type":"message_delivered"');
  });
});
