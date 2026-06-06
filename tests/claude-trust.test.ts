import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDirTrusted } from '../src/claude-trust.js';

const tmpConfig = join(tmpdir(), `claude-trust-test-${process.pid}.json`);

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(tmpConfig, 'utf8')) as Record<string, unknown>;
}

afterEach(() => {
  if (existsSync(tmpConfig)) {
    unlinkSync(tmpConfig);
  }
  const tmp = `${tmpConfig}.nfo-tmp`;
  if (existsSync(tmp)) {
    unlinkSync(tmp);
  }
});

describe('ensureDirTrusted', () => {
  it('creates a trusted project entry when the config file does not exist', () => {
    ensureDirTrusted('/some/worktrees', tmpConfig);

    expect(existsSync(tmpConfig)).toBe(true);
    const data = readConfig();
    const projects = data.projects as Record<string, Record<string, unknown>>;
    expect(projects['/some/worktrees'].hasTrustDialogAccepted).toBe(true);
    expect(projects['/some/worktrees'].allowedTools).toEqual([]);
  });

  it('is idempotent when already trusted', () => {
    ensureDirTrusted('/some/worktrees', tmpConfig);
    const statBefore = readFileSync(tmpConfig, 'utf8');

    ensureDirTrusted('/some/worktrees', tmpConfig);
    const statAfter = readFileSync(tmpConfig, 'utf8');

    expect(statAfter).toBe(statBefore);
    const data = readConfig();
    const projects = data.projects as Record<string, Record<string, unknown>>;
    expect(projects['/some/worktrees'].hasTrustDialogAccepted).toBe(true);
  });

  it('preserves other existing projects and top-level keys', () => {
    const initial = JSON.stringify({
      someOtherKey: 'preserved',
      projects: {
        '/other/dir': { hasTrustDialogAccepted: true, allowedTools: ['Bash'] },
      },
    }, null, 2);
    writeFileSync(tmpConfig, initial, 'utf8');

    ensureDirTrusted('/new/worktrees', tmpConfig);

    const data = readConfig();
    expect(data.someOtherKey).toBe('preserved');
    const projects = data.projects as Record<string, Record<string, unknown>>;
    expect(projects['/other/dir'].hasTrustDialogAccepted).toBe(true);
    expect(projects['/other/dir'].allowedTools).toEqual(['Bash']);
    expect(projects['/new/worktrees'].hasTrustDialogAccepted).toBe(true);
  });

  it('does not throw when config contains invalid JSON', () => {
    writeFileSync(tmpConfig, 'NOT VALID JSON!!!', 'utf8');

    expect(() => ensureDirTrusted('/some/worktrees', tmpConfig)).not.toThrow();
  });
});
