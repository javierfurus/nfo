import type { LaunchResult } from './launch.js';
import { sessionExists, sessionName, ensureNfoSessionUi } from '../tmux.js';
import { restoreOrchestra } from './restore.js';
import { readState } from '../state.js';
import { migrateLegacySidebarPane } from './dashboard-window.js';
import { runTui } from './tui.js';
import { reconcileMusicianLiveness } from '../musicians/reconcile.js';

export async function attachOrRestore(orchestraId: string, dryRun?: boolean, version = ''): Promise<LaunchResult> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    await ensureNfoSessionUi(name);
    await migrateLegacySidebarPane(name);
    await reconcileMusicianLiveness(orchestraId);
    if (!dryRun) {
      await runTui({ orchestraId, version });
    }
    return { action: 'attached', orchestraId };
  }
  return restoreOrchestra(orchestraId, dryRun, undefined, version);
}
