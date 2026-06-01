import type { Musician, OrchestraState } from '../state.types.js';

export function findMusician(state: OrchestraState, id: string): Musician | undefined {
  return state.musicians.find((m) => { return m.id === id; });
}

export function findMusicianStrict(state: OrchestraState, id: string): Musician {
  const m = findMusician(state, id);
  if (!m) {
    throw new Error(`Unknown musician: ${id}`);
  }
  return m;
}
