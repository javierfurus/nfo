import { readState } from '../state.js';
import type { Musician, OrchestraState } from '../state.types.js';
import { setMusicianStatus } from '../state-updaters.js';
import { captureVisiblePane, sessionName } from '../tmux.js';
import { drainQueuedMusicianMessages } from '../musicians/message.js';

export const IDLE_THRESHOLD_MS = 30_000;

export interface MusicianIdleSnapshot {
  signature: string;
  unchangedSince: string;
}

export type MusicianIdleTracker = Record<string, MusicianIdleSnapshot>;

export interface IdlePollResult {
  nextTracker: MusicianIdleTracker;
  idleMusicianIds: string[];
}

export function hasClaudeInputPrompt(paneText: string): boolean {
  const lines = paneText
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => { return line.trim(); });
  let promptIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^(?:❯|>|›)$/.test(lines[index])) {
      promptIndex = index;
      break;
    }
  }
  if (promptIndex === -1) {
    return false;
  }
  const trailingNonEmpty = lines.slice(promptIndex + 1).filter((line) => { return line.length > 0; });
  return trailingNonEmpty.length <= 2;
}

export function normalisePaneSignature(paneText: string): string {
  return paneText
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .trimEnd();
}

function millisSince(earlier: string, later: string): number {
  const earlierMs = Date.parse(earlier);
  const laterMs = Date.parse(later);
  if (Number.isNaN(earlierMs) || Number.isNaN(laterMs)) {
    return 0;
  }
  return laterMs - earlierMs;
}

function workingMusicians(state: OrchestraState): Musician[] {
  return state.musicians.filter((musician) => { return musician.status === 'working'; });
}

export function detectIdleMusicians(
  state: OrchestraState,
  panes: Record<string, string>,
  tracker: MusicianIdleTracker,
  now = new Date().toISOString(),
): IdlePollResult {
  const nextTracker: MusicianIdleTracker = {};
  const idleMusicianIds: string[] = [];

  for (const musician of workingMusicians(state)) {
    const paneText = panes[musician.id];
    if (!paneText) {
      continue;
    }

    const signature = normalisePaneSignature(paneText);
    const promptVisible = hasClaudeInputPrompt(signature);
    const previous = tracker[musician.id];
    const unchangedSince = previous?.signature === signature
      ? previous.unchangedSince
      : (promptVisible ? musician.last_activity : now);

    nextTracker[musician.id] = {
      signature,
      unchangedSince,
    };

    if (!promptVisible) {
      continue;
    }

    if (millisSince(unchangedSince, now) >= IDLE_THRESHOLD_MS) {
      idleMusicianIds.push(musician.id);
    }
  }

  return { nextTracker, idleMusicianIds };
}

export async function pollIdleMusicians(
  state: OrchestraState,
  tracker: MusicianIdleTracker,
  now = new Date().toISOString(),
): Promise<IdlePollResult> {
  const session = sessionName(state.orchestra_id);
  const panes = Object.fromEntries(await Promise.all(workingMusicians(state).map(async (musician) => {
    try {
      const pane = await captureVisiblePane(`${session}:${musician.tmux_window_id}`);
      return [musician.id, pane] as const;
    } catch {
      return [musician.id, ''] as const;
    }
  })));
  return detectIdleMusicians(state, panes, tracker, now);
}

export async function syncMusicianIdleState(
  orchestraId: string,
  tracker: MusicianIdleTracker,
  now = new Date().toISOString(),
): Promise<MusicianIdleTracker> {
  const state = await readState(orchestraId);
  if (!state) {
    return {};
  }

  const { nextTracker, idleMusicianIds } = await pollIdleMusicians(state, tracker, now);
  for (const musicianId of idleMusicianIds) {
    try {
      const fresh = await readState(orchestraId);
      const musician = fresh?.musicians.find((candidate) => { return candidate.id === musicianId; });
      if (!musician || musician.status !== 'working') {
        continue;
      }

      const deliveredMessages = await drainQueuedMusicianMessages(orchestraId, musicianId);
      if (deliveredMessages > 0) {
        await setMusicianStatus(orchestraId, musicianId, 'working', null);
        continue;
      }

      await setMusicianStatus(orchestraId, musicianId, 'idle', null);
    } catch {
      // Musician state can race with dismissals/restores; keep polling the rest.
    }
  }

  return nextTracker;
}
