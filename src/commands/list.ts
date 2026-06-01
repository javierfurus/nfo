import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getProjectsDir } from '../config.js';
import { readState } from '../state.js';
import { sessionExists, sessionName } from '../tmux.js';

export interface OrchestraSummary {
  id: string;
  project_path: string;
  permission_level: string;
  created_at: string;
  running: boolean;
  musician_count: number;
}

export async function listOrchestras(): Promise<OrchestraSummary[]> {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return [];
  const dirs = await readdir(projectsDir, { withFileTypes: true });
  const summaries: OrchestraSummary[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const state = await readState(d.name);
    if (!state) continue;
    summaries.push({
      id: state.orchestra_id,
      project_path: state.project_path,
      permission_level: state.permission_level,
      created_at: state.created_at,
      running: await sessionExists(sessionName(state.orchestra_id)),
      musician_count: state.musicians.length,
    });
  }
  return summaries;
}

export function formatOrchestraList(summaries: OrchestraSummary[]): string {
  if (summaries.length === 0) return 'No orchestras found.';
  const rows = summaries.map(s =>
    `${s.running ? '●' : '○'}  ${s.id}\n   ${s.project_path}\n   level=${s.permission_level} musicians=${s.musician_count}`,
  );
  return rows.join('\n\n');
}
