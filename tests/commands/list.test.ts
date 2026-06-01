import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listOrchestras } from '../../src/commands/list.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';

describe('listOrchestras', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('returns empty array when no orchestras exist', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    expect(await listOrchestras()).toEqual([]);
  });

  it('lists all orchestras with summary info', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    await ensureOrchestraDir('aaa-one');
    await writeState('aaa-one', makeInitialState({
      orchestraId: 'aaa-one',
      projectPath: '/tmp/one',
      permissionLevel: 'supervised',
    }));
    await ensureOrchestraDir('bbb-two');
    await writeState('bbb-two', makeInitialState({
      orchestraId: 'bbb-two',
      projectPath: '/tmp/two',
      permissionLevel: 'autonomous',
    }));

    const list = await listOrchestras();
    expect(list).toHaveLength(2);
    const ids = list.map(o => o.id).sort();
    expect(ids).toEqual(['aaa-one', 'bbb-two']);
  });
});
