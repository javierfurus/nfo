import { capturePane, sessionName } from '../tmux.js';
import { detectPermissionPrompt } from './detect-permission.js';
import type { OrchestraState } from '../state.types.js';

export interface PermissionTransition {
  musicianId: string;
  newStatus: 'awaiting_permission' | 'working';
  pendingPermission: string | null;
}

/**
 * For each non-stopped musician, capture the last lines of its tmux window,
 * run the permission-prompt detector, and emit a transition only when the
 * detected state differs from the musician's current status. Failures (e.g.
 * a window that no longer exists) are swallowed per-musician so one dead pane
 * never breaks the poll.
 */
export async function pollPermissions(state: OrchestraState): Promise<PermissionTransition[]> {
  const session = sessionName(state.orchestra_id);
  const transitions: PermissionTransition[] = [];

  for (const musician of state.musicians) {
    if (musician.status === 'stopped') {
      continue;
    }

    try {
      const paneText = await capturePane(`${session}:${musician.tmux_window_id}`, 20);
      const detected = detectPermissionPrompt(paneText);

      if (detected.pending && musician.status !== 'awaiting_permission') {
        transitions.push({
          musicianId: musician.id,
          newStatus: 'awaiting_permission',
          pendingPermission: detected.tool ?? 'tool',
        });
      } else if (!detected.pending && musician.status === 'awaiting_permission') {
        transitions.push({
          musicianId: musician.id,
          newStatus: 'working',
          pendingPermission: null,
        });
      }
    } catch {
      /* swallow — a dead window must not break the poll */
    }
  }

  return transitions;
}
