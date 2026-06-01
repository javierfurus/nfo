import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { killOrchestra } from '../../src/commands/kill.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { sessionExists, killSession, createDetachedSession, sessionName } from '../../src/tmux.js';
import { existsSync, readdirSync } from 'node:fs';
import { archiveDir } from '../../src/config.js';

describe('killOrchestra', () => {
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

  it('throws when orchestra is unknown', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    await expect(killOrchestra('does-not-exist', { yes: true })).rejects.toThrow(/Unknown orchestra/);
  });

  it('kills tmux session and archives state.json when -y', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId,
      projectPath: repo.path,
      permissionLevel: 'supervised',
    }));

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path, 220, 50);

    expect(await sessionExists(name)).toBe(true);

    await killOrchestra(orchestraId, { yes: true });

    expect(await sessionExists(name)).toBe(false);
    // state.json gone (moved to archive/)
    const reloaded = await readState(orchestraId);
    expect(reloaded).toBeNull();
    // archive/ has at least one state-<ts>.json
    const archived = readdirSync(archiveDir(orchestraId));
    expect(archived.some(f => /^state-\d+\.json$/.test(f))).toBe(true);
  });
});
