import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readState, writeState, ensureOrchestraDir } from '../src/state.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('state read/write', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    process.env.NFO_HOME = '';
  });

  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('writes and reads back the orchestra state round-trip', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'abc123-test',
      projectPath: '/tmp/example',
      permissionLevel: 'supervised',
    });

    await ensureOrchestraDir('abc123-test');
    await writeState('abc123-test', state);

    const loaded = await readState('abc123-test');
    expect(loaded).not.toBeNull();
    expect(loaded!.orchestra_id).toBe('abc123-test');
    expect(loaded!.permission_level).toBe('supervised');
    expect(loaded!.musicians).toEqual([]);
  });

  it('returns null when no state exists for the given key', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const loaded = await readState('does-not-exist');
    expect(loaded).toBeNull();
  });

  it('ensureOrchestraDir creates the standard subdirectory layout', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    await ensureOrchestraDir('abc123-test');
    const base = join(tmp.path, 'projects', 'abc123-test');
    expect(existsSync(base)).toBe(true);
    expect(existsSync(join(base, 'notes'))).toBe(true);
    expect(existsSync(join(base, 'logs'))).toBe(true);
    expect(existsSync(join(base, 'worktrees'))).toBe(true);
    expect(existsSync(join(base, 'archive'))).toBe(true);
  });

  it('serial writes leave a complete file (atomic rename)', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'serial-test',
      projectPath: '/tmp/example',
      permissionLevel: 'autonomous',
    });
    await ensureOrchestraDir('serial-test');

    // Hammer writes serially; each must produce a valid file on disk.
    for (let i = 0; i < 20; i++) {
      state.orchestrator_session_id = `session-${i}`;
      await writeState('serial-test', state);
      const loaded = await readState('serial-test');
      expect(loaded!.orchestrator_session_id).toBe(`session-${i}`);
    }
  });
});
