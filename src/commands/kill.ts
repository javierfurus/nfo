import { createInterface } from 'node:readline/promises';
import { rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from '../state.js';
import {
  sessionName,
  sessionExists,
  killSession,
} from '../tmux.js';
import { archiveDir, stateFile } from '../config.js';

export interface KillOptions {
  yes?: boolean;  // skip confirmation prompt
}

export async function killOrchestra(orchestraId: string, opts: KillOptions = {}): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = (await rl.question(
        `Kill orchestra ${orchestraId} (${state.project_path})? [y/N] `,
      )).trim().toLowerCase();
      if (ans !== 'y' && ans !== 'yes') {
        console.log('Aborted.');
        return;
      }
    } finally {
      rl.close();
    }
  }

  // Phase 1: no musicians (and therefore no worktrees to handle).
  // Phase 2 will add the worktree-archive prompt.

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    await killSession(name);
  }

  // Archive state.json under archive/state-<timestamp>.json so notes/ stays intact.
  await mkdir(archiveDir(orchestraId), { recursive: true });
  const archived = join(archiveDir(orchestraId), `state-${Date.now()}.json`);
  if (existsSync(stateFile(orchestraId))) {
    await rename(stateFile(orchestraId), archived);
  }
}
