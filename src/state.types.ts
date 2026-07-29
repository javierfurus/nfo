import type { PermissionLevel } from "./permission.js";

export type MusicianStatus =
  | "working"
  | "waiting"
  | "idle"
  | "awaiting_permission"
  | "stopped";
export type SubagentModel = "sonnet" | "haiku";

export interface MusicianReport {
  summary: string;
  next_steps: string | null;
  reported_at: string;
}

export interface Musician {
  id: string;
  name: string;
  task_summary: string;
  status: MusicianStatus;
  pending_permission?: string | null;
  tmux_window_id: string;
  claude_session_id: string | null;
  worktree_path: string | null;
  branch: string | null;
  spawned_at: string;
  last_activity: string;
  latest_report?: MusicianReport | null;
  model?: SubagentModel;
  detail?: string | null;
  last_state_report?: string | null;
}

export interface ArchivedMusician extends Musician {
  dismissed_at: string;
  summary: string | null;
}

export interface OrchestraState {
  version: number;
  orchestra_id: string;
  project_path: string;
  created_at: string;
  permission_level: PermissionLevel;
  notify_on_permission?: boolean;
  orchestrator_session_id: string | null;
  musicians: Musician[];
  archived_musicians: ArchivedMusician[];
}

export function makeInitialState(args: {
  orchestraId: string;
  projectPath: string;
  permissionLevel: PermissionLevel;
  notifyOnPermission?: boolean;
}): OrchestraState {
  const now = new Date().toISOString();
  return {
    version: 1,
    orchestra_id: args.orchestraId,
    project_path: args.projectPath,
    created_at: now,
    permission_level: args.permissionLevel,
    notify_on_permission: args.notifyOnPermission ?? false,
    orchestrator_session_id: null,
    musicians: [],
    archived_musicians: [],
  };
}
