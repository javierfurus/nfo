import { describe, it, expect, afterEach } from 'vitest';
import { resolveRepoRoot } from '../src/repo.js';
import { makeTmpRepo, makeTmpNonRepo, type TmpRepo } from './helpers/tmp-repo.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('resolveRepoRoot', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
  });

  async function track(t: TmpRepo) {
    cleanups.push(t.cleanup);
    return t;
  }

  it('returns the repo root when invoked from inside a repo', async () => {
    const repo = await track(await makeTmpRepo());
    const result = await resolveRepoRoot(repo.path);
    expect(result).toBe(repo.path);
  });

  it('returns the repo root when invoked from a subdirectory', async () => {
    const repo = await track(await makeTmpRepo());
    const subdir = join(repo.path, 'src', 'nested');
    await mkdir(subdir, { recursive: true });
    const result = await resolveRepoRoot(subdir);
    expect(result).toBe(repo.path);
  });

  it('returns null when invoked outside any repo', async () => {
    const nonRepo = await track(await makeTmpNonRepo());
    const result = await resolveRepoRoot(nonRepo.path);
    expect(result).toBeNull();
  });
});
