import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { stateDbFile, stateFile } from './config.js';
import type { PermissionLevel } from './permission.js';
import type {
  ArchivedMusician,
  Musician,
  MusicianStatus,
  OrchestraState,
  SubagentModel,
} from './state.types.js';

const DDL = `
CREATE TABLE IF NOT EXISTS orchestras (
  orchestra_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  project_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  permission_level TEXT NOT NULL,
  notify_on_permission INTEGER NOT NULL DEFAULT 0,
  orchestrator_session_id TEXT
);

CREATE TABLE IF NOT EXISTS musicians (
  orchestra_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  task_summary TEXT NOT NULL,
  status TEXT NOT NULL,
  pending_permission TEXT,
  tmux_window_id TEXT NOT NULL,
  claude_session_id TEXT,
  worktree_path TEXT,
  branch TEXT,
  spawned_at TEXT NOT NULL,
  last_activity TEXT NOT NULL,
  report_summary TEXT,
  report_next_steps TEXT,
  report_reported_at TEXT,
  model TEXT,
  detail TEXT,
  last_state_report TEXT,
  dismissed_at TEXT,
  summary TEXT,
  PRIMARY KEY (orchestra_id, id),
  FOREIGN KEY (orchestra_id) REFERENCES orchestras(orchestra_id) ON DELETE CASCADE
);
`;

interface OrchestraRow {
  orchestra_id: string;
  version: number;
  project_path: string;
  created_at: string;
  permission_level: string;
  notify_on_permission: number;
  orchestrator_session_id: string | null;
}

interface MusicianRow {
  orchestra_id: string;
  id: string;
  ord: number;
  archived: number;
  name: string;
  task_summary: string;
  status: string;
  pending_permission: string | null;
  tmux_window_id: string;
  claude_session_id: string | null;
  worktree_path: string | null;
  branch: string | null;
  spawned_at: string;
  last_activity: string;
  report_summary: string | null;
  report_next_steps: string | null;
  report_reported_at: string | null;
  model: string | null;
  detail: string | null;
  last_state_report: string | null;
  dismissed_at: string | null;
  summary: string | null;
}

const dbCache = new Map<string, Database.Database>();

export function openDb(orchestraId: string): Database.Database {
  const cached = dbCache.get(orchestraId);
  if (cached) {
    return cached;
  }

  const file = stateDbFile(orchestraId);
  mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(DDL);

  dbCache.set(orchestraId, db);

  migrateLegacyJson(db, orchestraId);

  return db;
}

function migrateLegacyJson(db: Database.Database, orchestraId: string): void {
  const existing = db.prepare('SELECT 1 FROM orchestras WHERE orchestra_id = ?').get(orchestraId);
  if (existing) {
    return;
  }

  const legacyFile = stateFile(orchestraId);
  if (!existsSync(legacyFile)) {
    return;
  }

  try {
    const raw = readFileSync(legacyFile, 'utf8');
    const legacyState = JSON.parse(raw) as OrchestraState;
    legacyState.version = legacyState.version ?? 1;
    legacyState.musicians = legacyState.musicians ?? [];
    legacyState.archived_musicians = legacyState.archived_musicians ?? [];

    runInWriteTransaction(db, () => {
      upsertOrchestraState(db, orchestraId, legacyState);
    });

    renameSync(legacyFile, `${legacyFile}.migrated`);
  } catch (err) {
    console.error(`nfo: failed to migrate legacy state.json for ${orchestraId}:`, err);
  }
}

export function runInWriteTransaction(db: Database.Database, fn: () => void): void {
  db.transaction(fn).immediate();
}

export function selectOrchestraState(db: Database.Database, orchestraId: string): OrchestraState | null {
  const orchRow = db
    .prepare('SELECT * FROM orchestras WHERE orchestra_id = ?')
    .get(orchestraId) as OrchestraRow | undefined;
  if (!orchRow) {
    return null;
  }

  const musicianRows = db
    .prepare('SELECT * FROM musicians WHERE orchestra_id = ? ORDER BY ord ASC')
    .all(orchestraId) as MusicianRow[];

  return rowToOrchestraState(orchRow, musicianRows);
}

const upsertOrchestraSql = `
  INSERT INTO orchestras (
    orchestra_id, version, project_path, created_at, permission_level,
    notify_on_permission, orchestrator_session_id
  ) VALUES (
    @orchestra_id, @version, @project_path, @created_at, @permission_level,
    @notify_on_permission, @orchestrator_session_id
  )
  ON CONFLICT(orchestra_id) DO UPDATE SET
    version = excluded.version,
    project_path = excluded.project_path,
    created_at = excluded.created_at,
    permission_level = excluded.permission_level,
    notify_on_permission = excluded.notify_on_permission,
    orchestrator_session_id = excluded.orchestrator_session_id
`;

const insertMusicianSql = `
  INSERT INTO musicians (
    orchestra_id, id, ord, archived, name, task_summary, status, pending_permission,
    tmux_window_id, claude_session_id, worktree_path, branch, spawned_at, last_activity,
    report_summary, report_next_steps, report_reported_at, model, detail, last_state_report,
    dismissed_at, summary
  ) VALUES (
    @orchestra_id, @id, @ord, @archived, @name, @task_summary, @status, @pending_permission,
    @tmux_window_id, @claude_session_id, @worktree_path, @branch, @spawned_at, @last_activity,
    @report_summary, @report_next_steps, @report_reported_at, @model, @detail, @last_state_report,
    @dismissed_at, @summary
  )
`;

export function upsertOrchestraState(db: Database.Database, orchestraId: string, state: OrchestraState): void {
  db.prepare(upsertOrchestraSql).run(orchestraRowFromState(state));

  db.prepare('DELETE FROM musicians WHERE orchestra_id = ?').run(orchestraId);

  const insertMusician = db.prepare(insertMusicianSql);
  state.musicians.forEach((m, idx) => {
    insertMusician.run(musicianRowFromMusician(orchestraId, m, idx, false));
  });
  state.archived_musicians.forEach((m, idx) => {
    insertMusician.run(musicianRowFromMusician(orchestraId, m, idx, true));
  });
}

export function deleteOrchestraState(db: Database.Database, orchestraId: string): void {
  db.prepare('DELETE FROM orchestras WHERE orchestra_id = ?').run(orchestraId);
}

function orchestraRowFromState(state: OrchestraState): OrchestraRow {
  return {
    orchestra_id: state.orchestra_id,
    version: state.version,
    project_path: state.project_path,
    created_at: state.created_at,
    permission_level: state.permission_level,
    notify_on_permission: state.notify_on_permission ? 1 : 0,
    orchestrator_session_id: state.orchestrator_session_id,
  };
}

function musicianRowFromMusician(
  orchestraId: string,
  m: Musician | ArchivedMusician,
  ord: number,
  archived: boolean,
): MusicianRow {
  const asArchived = m as Partial<ArchivedMusician>;
  return {
    orchestra_id: orchestraId,
    id: m.id,
    ord,
    archived: archived ? 1 : 0,
    name: m.name,
    task_summary: m.task_summary,
    status: m.status,
    pending_permission: m.pending_permission ?? null,
    tmux_window_id: m.tmux_window_id,
    claude_session_id: m.claude_session_id,
    worktree_path: m.worktree_path,
    branch: m.branch,
    spawned_at: m.spawned_at,
    last_activity: m.last_activity,
    report_summary: m.latest_report?.summary ?? null,
    report_next_steps: m.latest_report?.next_steps ?? null,
    report_reported_at: m.latest_report?.reported_at ?? null,
    model: m.model ?? null,
    detail: m.detail ?? null,
    last_state_report: m.last_state_report ?? null,
    dismissed_at: asArchived.dismissed_at ?? null,
    summary: asArchived.summary ?? null,
  };
}

function rowToMusician(row: MusicianRow): Musician {
  const m: Musician = {
    id: row.id,
    name: row.name,
    task_summary: row.task_summary,
    status: row.status as MusicianStatus,
    tmux_window_id: row.tmux_window_id,
    claude_session_id: row.claude_session_id,
    worktree_path: row.worktree_path,
    branch: row.branch,
    spawned_at: row.spawned_at,
    last_activity: row.last_activity,
  };

  if (row.pending_permission !== null) {
    m.pending_permission = row.pending_permission;
  }
  if (row.report_summary !== null || row.report_next_steps !== null || row.report_reported_at !== null) {
    m.latest_report = {
      summary: row.report_summary ?? '',
      next_steps: row.report_next_steps,
      reported_at: row.report_reported_at ?? '',
    };
  }
  if (row.model !== null) {
    m.model = row.model as SubagentModel;
  }
  if (row.detail !== null) {
    m.detail = row.detail;
  }
  if (row.last_state_report !== null) {
    m.last_state_report = row.last_state_report;
  }

  return m;
}

function rowToOrchestraState(orchRow: OrchestraRow, musicianRows: MusicianRow[]): OrchestraState {
  const musicians: Musician[] = [];
  const archivedMusicians: ArchivedMusician[] = [];

  for (const row of musicianRows) {
    if (row.archived === 1) {
      archivedMusicians.push({
        ...rowToMusician(row),
        dismissed_at: row.dismissed_at as string,
        summary: row.summary,
      });
    } else {
      musicians.push(rowToMusician(row));
    }
  }

  return {
    version: orchRow.version,
    orchestra_id: orchRow.orchestra_id,
    project_path: orchRow.project_path,
    created_at: orchRow.created_at,
    permission_level: orchRow.permission_level as PermissionLevel,
    notify_on_permission: orchRow.notify_on_permission === 1,
    orchestrator_session_id: orchRow.orchestrator_session_id,
    musicians,
    archived_musicians: archivedMusicians,
  };
}
