import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import {
  notesDir,
  logsDir,
  messageLogsDir,
  worktreesDir,
  archiveDir,
  stateFile,
  orchestraDir,
} from './config.js';
import type { OrchestraState } from './state.types.js';

export async function ensureOrchestraDir(projectKey: string): Promise<void> {
  await mkdir(orchestraDir(projectKey), { recursive: true });
  await mkdir(notesDir(projectKey), { recursive: true });
  await mkdir(logsDir(projectKey), { recursive: true });
  await mkdir(messageLogsDir(projectKey), { recursive: true });
  await mkdir(worktreesDir(projectKey), { recursive: true });
  await mkdir(archiveDir(projectKey), { recursive: true });
}

export async function readState(projectKey: string): Promise<OrchestraState | null> {
  const file = stateFile(projectKey);
  if (!existsSync(file)) return null;
  const buf = await readFile(file, 'utf8');
  return JSON.parse(buf) as OrchestraState;
}

export async function writeState(projectKey: string, state: OrchestraState): Promise<void> {
  const file = stateFile(projectKey);
  await mkdir(dirname(file), { recursive: true });

  // proper-lockfile needs the target file to exist before it can lock it.
  if (!existsSync(file)) {
    await writeFile(file, '{}', 'utf8');
  }

  const release = await lockfile.lock(file, { retries: { retries: 5, minTimeout: 50 } });
  try {
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, file);
  } finally {
    await release();
  }
}
