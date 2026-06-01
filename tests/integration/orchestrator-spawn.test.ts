import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

describe('NFO MCP server (e2e)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(async () => {
    process.env.NFO_HOME = '';
    if (!existsSync(CLI)) {
      throw new Error(`dist/cli.js missing; run \`npm run build\` first`);
    }
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

  it('lists 9 tools and dispatches spawn_musician via JSON-RPC', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);
    await writeState(orchId, makeInitialState({
      orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised',
    }));
    sessionsToKill.push(sessionName(orchId));
    await createDetachedSession(sessionName(orchId), repo.path, 220, 50);

    const proc = spawn(
      process.execPath,
      [CLI, 'mcp-server', '--orchestra-id', orchId],
      { env: { ...process.env, NFO_HOME: cfg.path } },
    );

    const responses: Array<Record<string, unknown>> = [];
    let stdoutBuf = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx).trim();
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (line.length > 0) responses.push(JSON.parse(line));
      }
    });

    function send(msg: Record<string, unknown>) {
      proc.stdin.write(JSON.stringify(msg) + '\n');
    }

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    }});

    await waitFor(() => responses.some(r => r.id === 1));

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await waitFor(() => responses.some(r => r.id === 2));
    const listResp = responses.find(r => r.id === 2) as any;
    expect(listResp.result.tools.length).toBe(9);

    send({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'spawn_musician',
        arguments: { name: 'tester', task: 'echo it', worktree: false, model: 'haiku' },
      },
    });
    await waitFor(() => responses.some(r => r.id === 3));

    proc.kill();

    const state = await readState(orchId);
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].name).toBe('tester');
    expect(state!.musicians[0].model).toBe('haiku');
  }, 15000);
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await new Promise(r => setTimeout(r, 25));
  }
}
