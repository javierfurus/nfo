import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { orchestraDir } from '../config.js';

export function orchestratorMcpConfigPath(orchestraId: string): string {
  return join(orchestraDir(orchestraId), 'mcp-config.json');
}

export function musicianMcpConfigPath(orchestraId: string, musicianId: string): string {
  return join(orchestraDir(orchestraId), `mcp-${musicianId}.json`);
}

export async function writeOrchestratorMcpConfig(orchestraId: string): Promise<string> {
  const path = orchestratorMcpConfigPath(orchestraId);
  await writeMcpConfig(path, orchestraId);
  return path;
}

export async function writeMusicianMcpConfig(orchestraId: string, musicianId: string): Promise<string> {
  const path = musicianMcpConfigPath(orchestraId, musicianId);
  await writeMcpConfig(path, orchestraId, musicianId);
  return path;
}

async function writeMcpConfig(path: string, orchestraId: string, callerMusicianId?: string): Promise<void> {
  const args = ['mcp-server', '--orchestra-id', orchestraId];
  if (callerMusicianId) {
    args.push('--caller-musician-id', callerMusicianId);
  }

  await writeFile(path, JSON.stringify({
    mcpServers: {
      nfo: {
        command: 'nfo',
        args,
      },
    },
  }, null, 2), 'utf8');
}
