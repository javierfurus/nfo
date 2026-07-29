import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { dispatch } from '../../src/mcp/handlers.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';

describe('MCP handlers dispatch', () => {
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

  async function setup(): Promise<{orchId: string; repoPath: string}> {
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
    sessionsToKill.push(sessionName(orchId));
    await createDetachedSession(sessionName(orchId), repo.path, 220, 50);
    return { orchId, repoPath: repo.path };
  }

  it('spawn_musician returns a musician_id', async () => {
    const { orchId } = await setup();
    const result = await dispatch(orchId, 'spawn_musician', {
      name: 'tester', task: 'do work', worktree: false, model: 'haiku',
    }, { dryRun: true });
    expect(result.musician_id).toMatch(/^mus-\d{3}$/);
    const state = await readState(orchId);
    expect(state!.musicians[0].model).toBe('haiku');
  });

  it('spawn_musician defaults to sonnet when model is omitted', async () => {
    const { orchId } = await setup();
    await dispatch(orchId, 'spawn_musician', {
      name: 'tester', task: 'do work', worktree: false,
    }, { dryRun: true });
    const state = await readState(orchId);
    expect(state!.musicians[0].model).toBe('sonnet');
  });

  it('list_musicians returns the live roster', async () => {
    const { orchId } = await setup();
    await dispatch(orchId, 'spawn_musician', { name: 'one', task: 't', worktree: false }, { dryRun: true });
    await dispatch(orchId, 'spawn_musician', { name: 'two', task: 't', worktree: false }, { dryRun: true });
    const result = await dispatch(orchId, 'list_musicians', {});
    expect(result.musicians).toHaveLength(2);
  });

  it('note_write / note_read round-trip', async () => {
    const { orchId } = await setup();
    await dispatch(orchId, 'note_write', { filename: 'overview.md', content: '# hi' });
    const result = await dispatch(orchId, 'note_read', { filename: 'overview.md' });
    expect(result.content).toBe('# hi');
  });

  it('report_done sets status to idle and records summary', async () => {
    const { orchId } = await setup();
    const { musician_id } = await dispatch(orchId, 'spawn_musician', {
      name: 'r', task: 't', worktree: false,
    }, { dryRun: true });
    const result = await dispatch(orchId, 'report_done', {
      summary: 'all green', _from_musician_id: musician_id,
    });
    expect(result.notified_orchestrator).toBe(true);
    const state = await readState(orchId);
    expect(state!.musicians[0].status).toBe('idle');
    expect(state!.musicians[0].latest_report).toMatchObject({
      summary: 'all green',
      next_steps: null,
    });
  });

  it('report_done drains queued follow-up work onto the musician', async () => {
    const { orchId, repoPath } = await setup();
    const name = sessionName(orchId);
    const { execa } = await import('execa');
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', name, '-n', 'mus-001-r', '-c', repoPath, '-d',
      '-P', '-F', '#{window_id}',
    ]);

    const { addMusician } = await import('../../src/state-updaters.js');
    const { capturePane } = await import('../../src/tmux.js');
    await addMusician(orchId, {
      id: 'mus-001',
      name: 'r',
      task_summary: 't',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    const queued = await dispatch(orchId, 'message_musician', {
      musician_id: 'mus-001',
      message: 'echo queued-follow-up',
    });
    expect(queued.delivery).toBe('queued');

    const result = await dispatch(orchId, 'report_done', {
      summary: 'finished first task',
      _from_musician_id: 'mus-001',
    });
    expect(result.delivered_messages).toBe(1);
    expect(result.notified_orchestrator).toBe(false);

    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${name}:${winId.trim()}`, 20);
    expect(out).toContain('queued-follow-up');

    const state = await readState(orchId);
    expect(state!.musicians[0].status).toBe('working');
  });

  it('report_done pushes the completion summary back to the orchestrator pane', async () => {
    const { orchId } = await setup();
    const { capturePane } = await import('../../src/tmux.js');
    const { musician_id } = await dispatch(orchId, 'spawn_musician', {
      name: 'reviewer', task: 't', worktree: false,
    }, { dryRun: true });

    await dispatch(orchId, 'report_done', {
      summary: 'Implemented the requested change',
      next_steps: 'If needed, ask me to tighten the tests.',
      _from_musician_id: musician_id,
    });

    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${sessionName(orchId)}:0`, 80);
    const flat = out.split('\n').map((l) => l.trimEnd()).join('');
    expect(flat).toContain(`Musician ${musician_id} (reviewer) reported done and is now idle.`);
    expect(flat).toContain('Implemented the requested change');
    expect(flat).toContain('dismiss_musician');
    expect(flat).toContain('message_musician');
  });

  it('throws on unknown tool', async () => {
    const { orchId } = await setup();
    await expect(dispatch(orchId, 'totally_made_up', {})).rejects.toThrow(/Unknown tool/);
  });
});
