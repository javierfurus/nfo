import { openDb, runInWriteTransaction, selectOrchestraState, upsertOrchestraState } from './db.js';
import type {
  ArchivedMusician,
  Musician,
  MusicianReport,
  MusicianStatus,
  OrchestraState,
} from './state.types.js';

function update(orchestraId: string, mutator: (s: OrchestraState) => void): void {
  const db = openDb(orchestraId);
  runInWriteTransaction(db, () => {
    const state = selectOrchestraState(db, orchestraId);
    if (!state) {
      throw new Error(`Unknown orchestra: ${orchestraId}`);
    }
    mutator(state);
    upsertOrchestraState(db, orchestraId, state);
  });
}

export function addMusician(orchestraId: string, m: Musician): void {
  update(orchestraId, (s) => { s.musicians.push(m); });
}

export function setMusicianStatus(
  orchestraId: string,
  musicianId: string,
  status: MusicianStatus,
  pendingPermission?: string | null,
): void {
  update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.status = status;
    if (pendingPermission !== undefined) {
      m.pending_permission = pendingPermission;
    }
  });
}

export function setMusicianTmuxWindowId(
  orchestraId: string,
  musicianId: string,
  tmuxWindowId: string,
): void {
  update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.tmux_window_id = tmuxWindowId;
  });
}

export function touchMusicianActivity(
  orchestraId: string,
  musicianId: string,
  timestamp?: string,
): void {
  const ts = timestamp ?? new Date().toISOString();
  update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.last_activity = ts;
  });
}

export function setMusicianLatestReport(
  orchestraId: string,
  musicianId: string,
  report: MusicianReport | null,
): void {
  update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.latest_report = report;
  });
}

const MAX_DETAIL_LEN = 100;

export function truncateDetail(detail: string): string {
  if (detail.length > MAX_DETAIL_LEN) {
    return detail.slice(0, MAX_DETAIL_LEN - 1) + '…';
  }
  return detail;
}

export function setMusicianState(
  orchestraId: string,
  musicianId: string,
  detail: string,
  timestamp?: string,
): string {
  const ts = timestamp ?? new Date().toISOString();
  const stored = truncateDetail(detail);
  update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.status = 'working';
    m.detail = stored;
    m.last_state_report = ts;
    m.last_activity = ts;
  });
  return stored;
}

export interface ArchiveArgs {
  summary: string | null;
  dismissedAt?: string;
}

export function archiveMusician(
  orchestraId: string,
  musicianId: string,
  args: ArchiveArgs,
): void {
  update(orchestraId, (s) => {
    const idx = s.musicians.findIndex((mu) => { return mu.id === musicianId; });
    if (idx === -1) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    const [m] = s.musicians.splice(idx, 1);
    const archived: ArchivedMusician = {
      ...m,
      status: 'stopped',
      dismissed_at: args.dismissedAt ?? new Date().toISOString(),
      summary: args.summary,
    };
    s.archived_musicians.push(archived);
  });
}
