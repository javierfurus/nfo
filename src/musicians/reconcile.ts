import { readState, writeState } from '../state.js';
import { sessionExists, sessionName, listLiveWindowIds } from '../tmux.js';

export async function reconcileMusicianLiveness(orchestraId: string): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) {
    return;
  }
  if (!(await sessionExists(sessionName(orchestraId)))) {
    return;
  }
  const live = await listLiveWindowIds(sessionName(orchestraId));
  let changed = false;
  for (const musician of state.musicians) {
    if (musician.status === 'stopped') {
      continue;
    }
    if (!live.has(musician.tmux_window_id)) {
      musician.status = 'stopped';
      musician.last_activity = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    await writeState(orchestraId, state);
  }
}
