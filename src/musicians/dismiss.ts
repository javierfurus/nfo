import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execa } from 'execa';
import { archiveMusician } from '../state-updaters.js';
import { readState } from '../state.js';
import { findMusicianStrict } from './lookup.js';
import { archiveDir } from '../config.js';
import { sessionName } from '../tmux.js';
import { removeWorktree, deleteBranch } from '../worktree.js';

export interface DismissMusicianOptions {
  orchestraId: string;
  musicianId: string;
  archiveWorktree?: boolean;     // default false
  summary?: string | null;
}

export async function dismissMusician(opts: DismissMusicianOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const musician = findMusicianStrict(state, opts.musicianId);
  const archivedSummary = opts.summary !== undefined
    ? opts.summary
    : (musician.status === 'idle' ? musician.latest_report?.summary ?? null : null);

  const archive = opts.archiveWorktree === true;

  // 1. Best-effort graceful shutdown of claude, then kill the window.
  const target = `${sessionName(opts.orchestraId)}:${musician.tmux_window_id}`;
  await execa('tmux', ['send-keys', '-l', '-t', target, '--', '/quit'], { reject: false });
  await execa('tmux', ['send-keys', '-t', target, 'Enter'], { reject: false });
  await new Promise((r) => { setTimeout(r, 200); });
  await execa('tmux', ['kill-window', '-t', target], { reject: false });

  // 2. Worktree handling.
  if (musician.worktree_path) {
    if (archive) {
      const dest = join(archiveDir(opts.orchestraId), opts.musicianId, 'worktree');
      await mkdir(dirname(dest), { recursive: true });
      const moved = await execa('git', ['worktree', 'move', musician.worktree_path, dest], {
        cwd: state.project_path, reject: false,
      });
      if (moved.exitCode !== 0) {
        await removeWorktree({ repoRoot: state.project_path, path: musician.worktree_path, force: true });
      }
    } else {
      await removeWorktree({ repoRoot: state.project_path, path: musician.worktree_path, force: true });
      if (musician.branch) {
        await deleteBranch(state.project_path, musician.branch);
      }
    }
  }

  // 3. Move state row.
  await archiveMusician(opts.orchestraId, opts.musicianId, {
    summary: archivedSummary,
  });
}
