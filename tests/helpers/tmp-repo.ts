import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';

export interface TmpRepo {
  path: string;
  cleanup: () => Promise<void>;
}

export async function makeTmpRepo(): Promise<TmpRepo> {
  const path = await mkdtemp(join(tmpdir(), 'nfo-test-repo-'));
  await execa('git', ['init', '-q'], { cwd: path });
  await execa('git', ['config', 'user.email', 'test@test.local'], { cwd: path });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: path });
  await execa('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: path });
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}

export async function makeTmpNonRepo(): Promise<TmpRepo> {
  const path = await mkdtemp(join(tmpdir(), 'nfo-test-norepo-'));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
