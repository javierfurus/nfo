import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { openNotes } from '../../src/commands/notes.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';

describe('openNotes', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const originalEditor = process.env.EDITOR;

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
    if (originalEditor === undefined) {
      delete process.env.EDITOR;
    } else {
      process.env.EDITOR = originalEditor;
    }
  });

  it('throws when orchestra is unknown', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    await expect(openNotes('nope-doesnt-exist')).rejects.toThrow(/Unknown orchestra/);
  });

  it('invokes $EDITOR with the notes directory path', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    // Use `true` as EDITOR — it accepts any args and exits 0 with no side effects.
    process.env.EDITOR = 'true';

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId,
      projectPath: repo.path,
      permissionLevel: 'supervised',
    }));

    // Should resolve without throwing — `true` consumes the arg and exits cleanly.
    await expect(openNotes(orchestraId)).resolves.toBeUndefined();
  });
});
