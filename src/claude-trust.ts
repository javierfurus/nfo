import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export function ensureDirTrusted(dir: string, configPath?: string): void {
  try {
    const resolvedConfig = configPath ?? join(homedir(), '.claude.json');

    let raw = '{}';
    if (existsSync(resolvedConfig)) {
      raw = readFileSync(resolvedConfig, 'utf8');
    }
    const pretty = raw.includes('\n');

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (typeof data !== 'object' || data === null) {
      return;
    }

    if (typeof data.projects !== 'object' || data.projects === null) {
      data.projects = {};
    }
    const projects = data.projects as Record<string, Record<string, unknown>>;

    const entry: Record<string, unknown> = typeof projects[dir] === 'object' && projects[dir] !== null
      ? { ...projects[dir] as Record<string, unknown> }
      : {};

    if (entry.hasTrustDialogAccepted === true) {
      return;
    }

    entry.hasTrustDialogAccepted = true;
    if (entry.allowedTools === undefined) {
      entry.allowedTools = [];
    }
    projects[dir] = entry;

    const serialized = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    const tmpPath = `${resolvedConfig}.nfo-tmp`;
    writeFileSync(tmpPath, serialized, 'utf8');
    renameSync(tmpPath, resolvedConfig);
  } catch {
    // Must never throw — trust seeding failures are non-fatal.
  }
}
