import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOrchestra } from '../../src/commands/launch.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { readState } from '../../src/state.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { sessionExists, killSession, sessionName } from '../../src/tmux.js';
import { orchestraDir } from '../../src/config.js';

describe('launch in a repo with no prior orchestra', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => {
    process.env.NFO_HOME = '';
  });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('creates an orchestra and a tmux session', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    const result = await createOrchestra({
      repoRoot: repo.path,
      orchestraId,
      permissionLevel: 'supervised',
      dryRun: true,
    });

    expect(result.action).toBe('created');
    expect(result.orchestraId).toBe(orchestraId);
    sessionsToKill.push(sessionName(result.orchestraId));

    const state = await readState(result.orchestraId);
    expect(state).not.toBeNull();
    expect(state!.project_path).toBe(repo.path);
    expect(state!.permission_level).toBe('supervised');
    expect(await sessionExists(sessionName(result.orchestraId))).toBe(true);

    const mcpCfg = join(orchestraDir(result.orchestraId), 'mcp-config.json');
    expect(existsSync(mcpCfg)).toBe(true);
    const parsed = JSON.parse(readFileSync(mcpCfg, 'utf8'));
    expect(parsed.mcpServers.nfo.command).toBe('nfo');
    expect(parsed.mcpServers.nfo.args).toEqual(['mcp-server', '--orchestra-id', result.orchestraId]);

    const { execa } = await import('execa');
    const { stdout: paneCount } = await execa('tmux', [
      'list-panes', '-t', `${sessionName(result.orchestraId)}:0`, '-F', '#{pane_index}',
    ]);
    expect(paneCount.trim().split('\n').length).toBe(1);
    const { stdout: status } = await execa('tmux', [
      'show-options', '-t', sessionName(result.orchestraId), 'status',
    ]);
    expect(status.trim()).toBe('status off');
  });
});
