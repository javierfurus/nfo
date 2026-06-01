import type { OrchestraState } from '../state.types.js';

/**
 * Generate the next musician id. Format: `mus-NNN` where NNN is zero-padded
 * to 3 digits and counts active + archived musicians. Never reuses an id even
 * after a musician is archived (avoids confusion in logs).
 */
export function nextMusicianId(state: OrchestraState): string {
  const used = new Set<string>();
  for (const m of state.musicians) {
    used.add(m.id);
  }
  for (const m of state.archived_musicians) {
    used.add(m.id);
  }
  let n = used.size + 1;
  while (used.has(`mus-${String(n).padStart(3, '0')}`)) {
    n++;
  }
  return `mus-${String(n).padStart(3, '0')}`;
}
