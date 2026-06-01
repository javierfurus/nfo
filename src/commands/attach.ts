import type { LaunchResult } from './launch.js';
import { sessionExists, sessionName, attachSession, ensureNfoSessionUi, selectWindow } from '../tmux.js';
import { restoreOrchestra } from './restore.js';
import { readState } from '../state.js';
import { DASHBOARD_WINDOW_NAME } from '../dashboard.js';
import { ensureDashboardWindow, migrateLegacySidebarPane } from './dashboard-window.js';

export async function attachOrRestore(orchestraId: string, dryRun?: boolean): Promise<LaunchResult> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    await ensureNfoSessionUi(name);
    await ensureDashboardWindow(name, state.project_path, orchestraId);
    await migrateLegacySidebarPane(name);
    if (!dryRun) {
      await selectWindow(name, DASHBOARD_WINDOW_NAME);
      await attachSession(name);
    }
    return { action: 'attached', orchestraId };
  }
  return restoreOrchestra(orchestraId, dryRun);
}
