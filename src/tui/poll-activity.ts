import { capturePane, sessionName } from '../tmux.js';
import { extractActivityLine } from './activity-line.js';
import type { OrchestraState } from '../state.types.js';

/**
 * For each non-stopped musician, capture the last lines of its tmux window
 * and reduce to a single activity hint. Failures (e.g. a window that no longer
 * exists) are swallowed per-musician so one dead pane never breaks the poll.
 */
export async function pollActivity(state: OrchestraState): Promise<Record<string, string>> {
  const session = sessionName(state.orchestra_id);
  const result: Record<string, string> = {};
  for (const musician of state.musicians) {
    if (musician.status === 'stopped') {
      continue;
    }
    try {
      const pane = await capturePane(`${session}:${musician.tmux_window_id}`, 10);
      result[musician.id] = extractActivityLine(pane);
    } catch {
      result[musician.id] = '';
    }
  }
  return result;
}
