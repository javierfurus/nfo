import { describe, it, expect, afterEach } from 'vitest';
import { execa } from 'execa';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTmpRepo, type TmpRepo } from './helpers/tmp-repo.js';
import { addWorktree, removeWorktree, worktreeExists } from '../src/worktree.js';

describe('worktree wrapper', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const dirsToRemove: string[] = [];

  afterEach(async () => {
    for (const d of dirsToRemove) {
      try { await rm(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    dirsToRemove.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
  });

  async function track(t: TmpRepo) {
    cleanups.push(t.cleanup);
    return t;
  }

  it('addWorktree creates a worktree on a new branch from HEAD', async () => {
    const repo = await track(await makeTmpRepo());
    const workArea = await mkdtemp(join(tmpdir(), 'nfo-wt-'));
    dirsToRemove.push(workArea);
    const path = join(workArea, 'mus-001');

    await addWorktree({ repoRoot: repo.path, path, branch: 'nfo/mus-001' });

    expect(existsSync(path)).toBe(true);
    expect(await worktreeExists(repo.path, path)).toBe(true);
  });

  it('addWorktree honours baseRef', async () => {
    const repo = await track(await makeTmpRepo());
    await execa('git', ['commit', '--allow-empty', '-m', 'second'], { cwd: repo.path });
    const { stdout: firstSha } = await execa('git', ['rev-parse', 'HEAD~1'], { cwd: repo.path });

    const workArea = await mkdtemp(join(tmpdir(), 'nfo-wt-'));
    dirsToRemove.push(workArea);
    const path = join(workArea, 'mus-002');

    await addWorktree({
      repoRoot: repo.path,
      path,
      branch: 'nfo/mus-002',
      baseRef: firstSha.trim(),
    });

    const { stdout: branchSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: path });
    expect(branchSha.trim()).toBe(firstSha.trim());
  });

  it('removeWorktree removes the worktree dir and metadata', async () => {
    const repo = await track(await makeTmpRepo());
    const workArea = await mkdtemp(join(tmpdir(), 'nfo-wt-'));
    dirsToRemove.push(workArea);
    const path = join(workArea, 'mus-003');

    await addWorktree({ repoRoot: repo.path, path, branch: 'nfo/mus-003' });
    expect(await worktreeExists(repo.path, path)).toBe(true);

    await removeWorktree({ repoRoot: repo.path, path });
    expect(existsSync(path)).toBe(false);
    expect(await worktreeExists(repo.path, path)).toBe(false);
  });
});
