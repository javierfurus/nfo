import { mkdir } from 'node:fs/promises';
import {
  notesDir,
  logsDir,
  messageLogsDir,
  worktreesDir,
  archiveDir,
  orchestraDir,
} from './config.js';
import { deleteOrchestraState, openDb, runInWriteTransaction, selectOrchestraState, upsertOrchestraState } from './db.js';
import type { OrchestraState } from './state.types.js';

export async function ensureOrchestraDir(projectKey: string): Promise<void> {
  await mkdir(orchestraDir(projectKey), { recursive: true });
  await mkdir(notesDir(projectKey), { recursive: true });
  await mkdir(logsDir(projectKey), { recursive: true });
  await mkdir(messageLogsDir(projectKey), { recursive: true });
  await mkdir(worktreesDir(projectKey), { recursive: true });
  await mkdir(archiveDir(projectKey), { recursive: true });
}

export function readState(projectKey: string): OrchestraState | null {
  const db = openDb(projectKey);
  return selectOrchestraState(db, projectKey);
}

export function writeState(projectKey: string, state: OrchestraState): void {
  const db = openDb(projectKey);
  runInWriteTransaction(db, () => {
    upsertOrchestraState(db, projectKey, state);
  });
}

export function deleteState(projectKey: string): void {
  const db = openDb(projectKey);
  runInWriteTransaction(db, () => {
    deleteOrchestraState(db, projectKey);
  });
}
