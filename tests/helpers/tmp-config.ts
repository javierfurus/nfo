import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TmpConfig {
  path: string;
  cleanup: () => Promise<void>;
}

export async function makeTmpConfig(): Promise<TmpConfig> {
  const path = await mkdtemp(join(tmpdir(), 'nfo-test-config-'));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
