import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { watchOrchestraState } from '../../src/tui/watch-state.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { setOrchestratorSessionId } from '../../src/state-updaters.js';
import type { OrchestraState } from '../../src/state.types.js';

describe('watchOrchestraState', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const stops: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const stop of stops) { await stop(); }
    stops.length = 0;
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('emits the current state immediately and again on change', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    await ensureOrchestraDir('orch-w');
    await writeState('orch-w', makeInitialState({
      orchestraId: 'orch-w', projectPath: '/tmp/x', permissionLevel: 'supervised',
    }));

    const seen: OrchestraState[] = [];
    const stop = await watchOrchestraState('orch-w', (s) => { seen.push(s); });
    stops.push(stop);

    // initial emit
    await waitFor(() => { return seen.length >= 1; });
    expect(seen[0].orchestra_id).toBe('orch-w');

    // mutate → expect another emit
    await setOrchestratorSessionId('orch-w', 'sess-123');
    await waitFor(() => { return seen.some((s) => { return s.orchestrator_session_id === 'sess-123'; }); }, 4000);
    expect(seen.some((s) => { return s.orchestrator_session_id === 'sess-123'; })).toBe(true);
  });
});

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out');
    }
    await new Promise((r) => { setTimeout(r, 25); });
  }
}
