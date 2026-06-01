import { capturePane, sessionName } from '../tmux.js';
import { readState } from '../state.js';
import { findMusicianStrict } from './lookup.js';

export interface QueryMusicianOptions {
  orchestraId: string;
  musicianId: string;
  lines?: number;
}

export async function queryMusician(opts: QueryMusicianOptions): Promise<string> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const musician = findMusicianStrict(state, opts.musicianId);
  const target = `${sessionName(opts.orchestraId)}:${musician.tmux_window_id}`;
  return capturePane(target, opts.lines ?? 80);
}
