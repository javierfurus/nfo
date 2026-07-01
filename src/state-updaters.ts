import { readState, writeState } from './state.js';
import type {
  ArchivedMusician,
  Musician,
  MusicianReport,
  MusicianStatus,
  OrchestraState,
} from './state.types.js';

async function update(
  orchestraId: string,
  mutator: (s: OrchestraState) => void,
): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${orchestraId}`);
  }
  mutator(state);
  await writeState(orchestraId, state);
}

export async function addMusician(orchestraId: string, m: Musician): Promise<void> {
  await update(orchestraId, (s) => { s.musicians.push(m); });
}

export async function setMusicianStatus(
  orchestraId: string,
  musicianId: string,
  status: MusicianStatus,
  pendingPermission?: string | null,
): Promise<void> {
  await update(orchestraId, (s) => {
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

export async function setMusicianClaudeSessionId(
  orchestraId: string,
  musicianId: string,
  sessionId: string,
): Promise<void> {
  await update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.claude_session_id = sessionId;
  });
}

export async function setMusicianTmuxWindowId(
  orchestraId: string,
  musicianId: string,
  tmuxWindowId: string,
): Promise<void> {
  await update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.tmux_window_id = tmuxWindowId;
  });
}

export async function touchMusicianActivity(
  orchestraId: string,
  musicianId: string,
  timestamp?: string,
): Promise<void> {
  const ts = timestamp ?? new Date().toISOString();
  await update(orchestraId, (s) => {
    const m = s.musicians.find((mu) => { return mu.id === musicianId; });
    if (!m) {
      throw new Error(`Unknown musician: ${musicianId}`);
    }
    m.last_activity = ts;
  });
}

export async function setMusicianLatestReport(
  orchestraId: string,
  musicianId: string,
  report: MusicianReport | null,
): Promise<void> {
  await update(orchestraId, (s) => {
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

export async function setMusicianState(
  orchestraId: string,
  musicianId: string,
  detail: string,
  timestamp?: string,
): Promise<string> {
  const ts = timestamp ?? new Date().toISOString();
  const stored = truncateDetail(detail);
  await update(orchestraId, (s) => {
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

export async function setOrchestratorSessionId(
  orchestraId: string,
  sessionId: string,
): Promise<void> {
  await update(orchestraId, (s) => { s.orchestrator_session_id = sessionId; });
}

export interface ArchiveArgs {
  summary: string | null;
  dismissedAt?: string;
}

export async function archiveMusician(
  orchestraId: string,
  musicianId: string,
  args: ArchiveArgs,
): Promise<void> {
  await update(orchestraId, (s) => {
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
