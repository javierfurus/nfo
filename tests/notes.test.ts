import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { noteRead, noteWrite, noteList } from '../src/notes.js';
import { ensureOrchestraDir } from '../src/state.js';
import { makeTmpConfig } from './helpers/tmp-config.js';

describe('notes', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('noteWrite then noteRead returns the written content', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-a');

    await noteWrite('orch-a', 'overview.md', '# Project overview\n');
    const back = await noteRead('orch-a', 'overview.md');
    expect(back).toBe('# Project overview\n');
  });

  it('noteRead returns empty string for missing notes', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-b');

    expect(await noteRead('orch-b', 'nope.md')).toBe('');
  });

  it('noteList returns all markdown filenames in notes/', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-c');
    await noteWrite('orch-c', 'overview.md', 'a');
    await noteWrite('orch-c', 'decisions.md', 'b');

    const list = await noteList('orch-c');
    expect(list.sort()).toEqual(['decisions.md', 'overview.md']);
  });

  it('rejects filenames containing path separators', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-d');
    await expect(noteWrite('orch-d', '../escape.md', 'pwn')).rejects.toThrow(/invalid filename/i);
    await expect(noteRead('orch-d', '../escape.md')).rejects.toThrow(/invalid filename/i);
  });
});
