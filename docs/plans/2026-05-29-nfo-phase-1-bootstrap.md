# NFO Phase 1 — Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `nfo` CLI in a state where a user can run it in a git repo to create or attach to an Orchestra, see the Orchestrator's `claude` session running in a tmux pane, detach, re-attach, and tear down. No Musicians, no Ink TUI yet — those land in Phase 2 and Phase 3.

**Architecture:** A Node.js + TypeScript CLI installed globally as `nfo`. It detects git repos, computes a stable project key, manages per-orchestra state JSON under `~/.config/nfo/`, and choreographs tmux sessions via shell commands. The Orchestrator pane runs the user's installed `claude` CLI with our MCP-server-less prompt addendum.

**Tech Stack:** Node.js 20+, TypeScript 5+, commander (CLI parsing), proper-lockfile (file locking on state.json), execa (child process spawning), vitest (testing). No Ink and no @modelcontextprotocol/sdk in Phase 1 — they arrive in later phases.

**Reference spec:** `docs/specs/2026-05-29-nfo-design.md`. Sections relevant to Phase 1: §1, §2, §3.1, §3.2 (the main window/Orchestrator pane half), §3.3 (state.json ownership), §4.1, §4.2, §4.3, §4.4, §4.5, §4.7, §5.1, §5.2 (all four permission levels including `auto` with confirmation gate), §5.4 (prompt composition for the Orchestrator), §7.1, §7.2, §9 (tmux integration), §10 (CLI surface — `nfo`, `nfo <id>`, `nfo list`, `nfo kill <id>`, `nfo restore <id>`, `nfo notes <id>`), §11.

**Explicitly NOT in Phase 1 (must not creep in):**
- NFO MCP server and any of its tools (Phase 2)
- The Ink TUI side pane (Phase 3) — Phase 1 leaves the right pane empty or with a placeholder message
- Musician spawn/dismiss/message/query/report_done (Phase 2)
- Worktrees (Phase 2)
- Permission prompt detection from §5.2.1 (Phase 4)
- Notes-as-MCP-tools (Phase 2; in Phase 1, `nfo notes <id>` just opens the dir in $EDITOR — no reading by the Orchestrator yet)
- Concert Hall multi-orchestra UI (Phase 3)

---

## File Structure

```
package.json
tsconfig.json
vitest.config.ts
.gitignore
.npmrc                            # optional, sets engine strictness
README.md
src/
├── cli.ts                        # bin entry point — commander wiring
├── config.ts                     # paths + constants (~/.config/nfo, etc.)
├── project-key.ts                # project key derivation from repo path
├── repo.ts                       # git repo detection + root resolution
├── claude-detect.ts              # claude CLI version check
├── permission.ts                 # permission level types + claude flag mapping + auto gate
├── state.ts                      # state.json read/write with locking
├── state.types.ts                # TypeScript types for state shape
├── tmux.ts                       # tmux command wrappers
├── prompts/
│   └── orchestrator-role.ts      # the role addendum string (Phase 1 keeps it inline)
└── commands/
    ├── launch.ts                 # smart launch (no-args)
    ├── attach.ts                 # attach to a known id
    ├── restore.ts                # restore stopped orchestra
    ├── list.ts                   # nfo list
    ├── kill.ts                   # nfo kill <id>
    └── notes.ts                  # nfo notes <id>
tests/
├── project-key.test.ts
├── repo.test.ts
├── permission.test.ts
├── state.test.ts
├── tmux.test.ts
├── commands/
│   ├── launch.test.ts
│   └── list.test.ts
└── helpers/
    ├── tmp-repo.ts               # creates a throwaway git repo + cleans up
    └── tmp-config.ts             # creates a throwaway ~/.config/nfo
```

---

## Task 1: Project skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/cli.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nfo-cli",
  "version": "0.0.0",
  "description": "NoFluffOrchestra — TUI multi-agent orchestrator for existing repos",
  "type": "module",
  "bin": {
    "nfo": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "execa": "^9.0.0",
    "proper-lockfile": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/proper-lockfile": "^4.1.4",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
```

- [ ] **Step 5: Create `src/cli.ts` placeholder**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program
  .name('nfo')
  .description('NoFluffOrchestra — TUI multi-agent orchestrator')
  .version('0.0.0');

program.parse(process.argv);
```

- [ ] **Step 6: Install dependencies and verify build**

Run: `npm install`
Expected: completes without error, creates `node_modules`.

Run: `npm run build`
Expected: completes without error, produces `dist/cli.js`.

Run: `npm run typecheck`
Expected: no output (passes).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/cli.ts
git commit -m "chore: project skeleton (TypeScript + commander + vitest)"
```

---

## Task 2: Config paths and constants

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create `src/config.ts`**

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';

export const NFO_HOME = process.env.NFO_HOME ?? join(homedir(), '.config', 'nfo');
export const PROJECTS_DIR = join(NFO_HOME, 'projects');
export const GLOBAL_CONFIG_FILE = join(NFO_HOME, 'config.json');

export const STATE_VERSION = 1;
export const STATE_FILENAME = 'state.json';
export const NOTES_DIRNAME = 'notes';
export const LOGS_DIRNAME = 'logs';
export const WORKTREES_DIRNAME = 'worktrees';
export const ARCHIVE_DIRNAME = 'archive';

export const orchestraDir = (projectKey: string): string =>
  join(PROJECTS_DIR, projectKey);

export const stateFile = (projectKey: string): string =>
  join(orchestraDir(projectKey), STATE_FILENAME);

export const notesDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), NOTES_DIRNAME);

export const logsDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), LOGS_DIRNAME);

export const worktreesDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), WORKTREES_DIRNAME);

export const archiveDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), ARCHIVE_DIRNAME);
```

Note: `NFO_HOME` env var override is for testing — production users get `~/.config/nfo`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(config): paths and dir helpers for ~/.config/nfo layout"
```

---

## Task 3: Project key derivation

**Files:**
- Create: `tests/project-key.test.ts`
- Create: `src/project-key.ts`

- [ ] **Step 1: Write the failing test**

`tests/project-key.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { projectKeyFromPath } from '../src/project-key.js';

describe('projectKeyFromPath', () => {
  it('produces a stable key for a given absolute path', () => {
    const key1 = projectKeyFromPath('/home/user/projects/myrepo');
    const key2 = projectKeyFromPath('/home/user/projects/myrepo');
    expect(key1).toBe(key2);
  });

  it('includes the basename as a readable suffix', () => {
    const key = projectKeyFromPath('/home/user/projects/myrepo');
    expect(key.endsWith('-myrepo')).toBe(true);
  });

  it('produces a 10-char sha1 prefix', () => {
    const key = projectKeyFromPath('/home/user/projects/myrepo');
    const prefix = key.split('-')[0];
    expect(prefix).toHaveLength(10);
    expect(prefix).toMatch(/^[0-9a-f]{10}$/);
  });

  it('produces different keys for different paths', () => {
    const a = projectKeyFromPath('/home/user/projects/foo');
    const b = projectKeyFromPath('/home/user/projects/bar');
    expect(a).not.toBe(b);
  });

  it('sanitizes non-alphanumeric basename characters', () => {
    const key = projectKeyFromPath('/tmp/my repo with spaces');
    expect(key).toMatch(/^[0-9a-f]{10}-[a-z0-9-]+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- project-key`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/project-key.ts`**

```typescript
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

export function projectKeyFromPath(absolutePath: string): string {
  const hash = createHash('sha1').update(absolutePath).digest('hex').slice(0, 10);
  const name = basename(absolutePath)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${hash}-${name || 'project'}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- project-key`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/project-key.ts tests/project-key.test.ts
git commit -m "feat(project-key): derive stable per-repo orchestra key"
```

---

## Task 4: Git repo detection

**Files:**
- Create: `tests/helpers/tmp-repo.ts`
- Create: `tests/repo.test.ts`
- Create: `src/repo.ts`

- [ ] **Step 1: Create the tmp-repo test helper**

`tests/helpers/tmp-repo.ts`:

```typescript
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
```

- [ ] **Step 2: Write the failing test**

`tests/repo.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- repo`
Expected: FAIL.

- [ ] **Step 4: Implement `src/repo.ts`**

```typescript
import { execa } from 'execa';

export async function resolveRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      reject: false,
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
```

Note: on macOS some git versions resolve `/tmp` differently to `/private/tmp`. If tests fail on macOS due to symlink resolution, normalize both sides with `fs.realpath` before comparing. Add that to the implementation only if a real failure surfaces — YAGNI in Linux CI.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- repo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repo.ts tests/repo.test.ts tests/helpers/tmp-repo.ts
git commit -m "feat(repo): resolve repo root via git rev-parse"
```

---

## Task 5: Permission level types and flag mapping

**Files:**
- Create: `tests/permission.test.ts`
- Create: `src/permission.ts`

- [ ] **Step 1: Write the failing test**

`tests/permission.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PERMISSION_LEVELS,
  claudeFlagsForLevel,
  isPermissionLevel,
  type PermissionLevel,
} from '../src/permission.js';

describe('permission levels', () => {
  it('lists all four levels in order from most to least permissive', () => {
    expect(PERMISSION_LEVELS).toEqual(['auto', 'autonomous', 'supervised', 'strict']);
  });

  it('isPermissionLevel rejects unknown strings', () => {
    expect(isPermissionLevel('auto')).toBe(true);
    expect(isPermissionLevel('autonomous')).toBe(true);
    expect(isPermissionLevel('supervised')).toBe(true);
    expect(isPermissionLevel('strict')).toBe(true);
    expect(isPermissionLevel('YOLO')).toBe(false);
    expect(isPermissionLevel('')).toBe(false);
  });

  it('claudeFlagsForLevel returns the right flag list per level', () => {
    expect(claudeFlagsForLevel('auto')).toEqual(['--dangerously-skip-permissions']);
    expect(claudeFlagsForLevel('autonomous')).toEqual(['--permission-mode', 'acceptEdits']);
    expect(claudeFlagsForLevel('supervised')).toEqual(['--permission-mode', 'default']);
    expect(claudeFlagsForLevel('strict')).toEqual(['--permission-mode', 'plan']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- permission`
Expected: FAIL.

- [ ] **Step 3: Implement `src/permission.ts`**

```typescript
export const PERMISSION_LEVELS = ['auto', 'autonomous', 'supervised', 'strict'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export function isPermissionLevel(s: string): s is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(s);
}

export function claudeFlagsForLevel(level: PermissionLevel): string[] {
  switch (level) {
    case 'auto':
      // Spec §5.2 + §12.2 open question: exact bypass flag is `--dangerously-skip-permissions`
      // in current Claude Code releases. If a future release renames it, update here.
      return ['--dangerously-skip-permissions'];
    case 'autonomous':
      return ['--permission-mode', 'acceptEdits'];
    case 'supervised':
      return ['--permission-mode', 'default'];
    case 'strict':
      return ['--permission-mode', 'plan'];
  }
}

export const AUTO_CONFIRM_PHRASE = 'I understand';

export const AUTO_WARNING = `⚠ AUTO mode disables all permission checks.
Musicians can execute arbitrary shell commands, modify files anywhere on
this system, and access the network without asking. Worktrees limit but
do not contain risky operations. Use this only in trusted sandboxes or
when you accept these risks.
Type "${AUTO_CONFIRM_PHRASE}" to continue.`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- permission`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/permission.ts tests/permission.test.ts
git commit -m "feat(permission): four-level enum and claude flag mapping"
```

---

## Task 6: State types

**Files:**
- Create: `src/state.types.ts`

- [ ] **Step 1: Create `src/state.types.ts`**

```typescript
import type { PermissionLevel } from './permission.js';

export type MusicianStatus = 'working' | 'idle' | 'awaiting_permission' | 'stopped';

export interface Musician {
  id: string;
  name: string;
  task_summary: string;
  status: MusicianStatus;
  pending_permission?: string | null;
  tmux_window_id: string;
  claude_session_id: string | null;
  worktree_path: string | null;
  branch: string | null;
  spawned_at: string;
  last_activity: string;
}

export interface ArchivedMusician extends Musician {
  dismissed_at: string;
  summary: string | null;
}

export interface OrchestraState {
  version: number;
  orchestra_id: string;
  project_path: string;
  created_at: string;
  permission_level: PermissionLevel;
  orchestrator_session_id: string | null;
  musicians: Musician[];
  archived_musicians: ArchivedMusician[];
}

export function makeInitialState(args: {
  orchestraId: string;
  projectPath: string;
  permissionLevel: PermissionLevel;
}): OrchestraState {
  const now = new Date().toISOString();
  return {
    version: 1,
    orchestra_id: args.orchestraId,
    project_path: args.projectPath,
    created_at: now,
    permission_level: args.permissionLevel,
    orchestrator_session_id: null,
    musicians: [],
    archived_musicians: [],
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/state.types.ts
git commit -m "feat(state): TS types for orchestra and musician state"
```

---

## Task 7: State read/write with locking

**Files:**
- Create: `tests/helpers/tmp-config.ts`
- Create: `tests/state.test.ts`
- Create: `src/state.ts`

- [ ] **Step 1: Create the tmp-config helper**

`tests/helpers/tmp-config.ts`:

```typescript
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
```

- [ ] **Step 2: Write the failing test**

`tests/state.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readState, writeState, ensureOrchestraDir } from '../src/state.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('state read/write', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    process.env.NFO_HOME = '';
  });

  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('writes and reads back the orchestra state round-trip', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'abc123-test',
      projectPath: '/tmp/example',
      permissionLevel: 'supervised',
    });

    await ensureOrchestraDir('abc123-test');
    await writeState('abc123-test', state);

    const loaded = await readState('abc123-test');
    expect(loaded).not.toBeNull();
    expect(loaded!.orchestra_id).toBe('abc123-test');
    expect(loaded!.permission_level).toBe('supervised');
    expect(loaded!.musicians).toEqual([]);
  });

  it('returns null when no state exists for the given key', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const loaded = await readState('does-not-exist');
    expect(loaded).toBeNull();
  });

  it('ensureOrchestraDir creates the standard subdirectory layout', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    await ensureOrchestraDir('abc123-test');
    const base = join(tmp.path, 'projects', 'abc123-test');
    expect(existsSync(base)).toBe(true);
    expect(existsSync(join(base, 'notes'))).toBe(true);
    expect(existsSync(join(base, 'logs'))).toBe(true);
    expect(existsSync(join(base, 'worktrees'))).toBe(true);
    expect(existsSync(join(base, 'archive'))).toBe(true);
  });

  it('serial writes leave a complete file (atomic rename)', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    const state = makeInitialState({
      orchestraId: 'serial-test',
      projectPath: '/tmp/example',
      permissionLevel: 'autonomous',
    });
    await ensureOrchestraDir('serial-test');

    // Hammer writes serially; each must produce a valid file on disk.
    for (let i = 0; i < 20; i++) {
      state.orchestrator_session_id = `session-${i}`;
      await writeState('serial-test', state);
      const loaded = await readState('serial-test');
      expect(loaded!.orchestrator_session_id).toBe(`session-${i}`);
    }
  });
});
```

Note: a concurrent-write race test is feasible but flaky to write reliably. `proper-lockfile` is well-trusted; relying on the serial test plus the library is acceptable for v1.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- state`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/state.ts`**

```typescript
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import {
  notesDir,
  logsDir,
  worktreesDir,
  archiveDir,
  stateFile,
  orchestraDir,
} from './config.js';
import type { OrchestraState } from './state.types.js';

export async function ensureOrchestraDir(projectKey: string): Promise<void> {
  await mkdir(orchestraDir(projectKey), { recursive: true });
  await mkdir(notesDir(projectKey), { recursive: true });
  await mkdir(logsDir(projectKey), { recursive: true });
  await mkdir(worktreesDir(projectKey), { recursive: true });
  await mkdir(archiveDir(projectKey), { recursive: true });
}

export async function readState(projectKey: string): Promise<OrchestraState | null> {
  const file = stateFile(projectKey);
  if (!existsSync(file)) return null;
  const buf = await readFile(file, 'utf8');
  return JSON.parse(buf) as OrchestraState;
}

export async function writeState(projectKey: string, state: OrchestraState): Promise<void> {
  const file = stateFile(projectKey);
  await mkdir(dirname(file), { recursive: true });

  // proper-lockfile needs the target file to exist before it can lock it.
  if (!existsSync(file)) {
    await writeFile(file, '{}', 'utf8');
  }

  const release = await lockfile.lock(file, { retries: { retries: 5, minTimeout: 50 } });
  try {
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, file);
  } finally {
    await release();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- state`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/state.ts tests/state.test.ts tests/helpers/tmp-config.ts
git commit -m "feat(state): atomic read/write with proper-lockfile"
```

---

## Task 8: tmux command wrapper

**Files:**
- Create: `tests/tmux.test.ts`
- Create: `src/tmux.ts`

This task assumes `tmux` is installed on the dev machine and CI. We test against real tmux; mocking shell-out semantics is brittle and gives false confidence.

- [ ] **Step 1: Write the failing test**

`tests/tmux.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  sessionExists,
  createDetachedSession,
  killSession,
  capturePane,
  sendKeys,
  sessionName,
} from '../src/tmux.js';

describe('tmux wrapper', () => {
  const sessionsToKill: string[] = [];
  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
  });

  it('sessionName composes from project key', () => {
    expect(sessionName('abcd1234ef-myrepo')).toBe('nfo-abcd1234ef-myrepo');
  });

  it('sessionExists returns false when no such session', async () => {
    expect(await sessionExists('nfo-does-not-exist-zzz')).toBe(false);
  });

  it('creates a detached session and detects it exists', async () => {
    const name = `nfo-test-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    expect(await sessionExists(name)).toBe(true);
  });

  it('killSession removes a running session', async () => {
    const name = `nfo-test-kill-${Date.now()}`;
    await createDetachedSession(name, '/tmp');
    await killSession(name);
    expect(await sessionExists(name)).toBe(false);
  });

  it('capturePane returns the visible pane content after sendKeys', async () => {
    const name = `nfo-test-cap-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    await sendKeys(`${name}:0`, 'echo hello-from-test', true);
    // Allow shell to render output.
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${name}:0`, 20);
    expect(out).toContain('hello-from-test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tmux`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/tmux.ts`**

```typescript
import { execa } from 'execa';

export function sessionName(projectKey: string): string {
  return `nfo-${projectKey}`;
}

export async function sessionExists(name: string): Promise<boolean> {
  const result = await execa('tmux', ['has-session', '-t', name], { reject: false });
  return result.exitCode === 0;
}

export async function createDetachedSession(name: string, cwd: string): Promise<void> {
  await execa('tmux', ['new-session', '-d', '-s', name, '-c', cwd]);
}

export async function killSession(name: string): Promise<void> {
  await execa('tmux', ['kill-session', '-t', name], { reject: false });
}

export async function attachSession(name: string): Promise<void> {
  // Inherits stdio so the user's terminal becomes the tmux client.
  await execa('tmux', ['attach-session', '-t', name], { stdio: 'inherit' });
}

export async function splitWindowHorizontal(
  target: string,
  percent: number,
  command?: string,
): Promise<void> {
  const args = ['split-window', '-h', '-p', String(percent), '-t', target];
  if (command) args.push(command);
  await execa('tmux', args);
}

export async function sendKeys(target: string, text: string, withEnter: boolean): Promise<void> {
  // Use -l (literal) to avoid keystroke interpretation.
  await execa('tmux', ['send-keys', '-l', '-t', target, '--', text]);
  if (withEnter) {
    await execa('tmux', ['send-keys', '-t', target, 'Enter']);
  }
}

export async function capturePane(target: string, lines: number): Promise<string> {
  const { stdout } = await execa('tmux', [
    'capture-pane',
    '-p',
    '-t',
    target,
    '-S',
    `-${lines}`,
  ]);
  return stdout;
}

export async function setSessionOption(name: string, option: string, value: string): Promise<void> {
  await execa('tmux', ['set-option', '-t', name, option, value]);
}

export async function bindKeyForSession(name: string, key: string, command: string): Promise<void> {
  // Session-scoped binding requires tmux >= 3.2 with the `-T` flag for tables; for v1 we
  // rely on a globally-installed binding because per-session bindings have varied support.
  // Phase 1 keeps this as a thin shim; the actual binding install lives in launch.ts.
  await execa('tmux', ['bind-key', '-T', name, key, ...command.split(' ')], { reject: false });
}
```

Note on `bindKeyForSession`: this is a forward-looking helper. Phase 1's launch.ts may end up not using it (we may just rely on default tmux navigation). If unused at the end of Phase 1, delete it before commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tmux`
Expected: PASS, all 5 tests green.

If running on a CI machine without tmux available, these tests will fail outright. Skip with `it.skipIf(!hasTmux)` only if necessary; v1 assumes tmux is a hard dependency, so CI must have it.

- [ ] **Step 5: Commit**

```bash
git add src/tmux.ts tests/tmux.test.ts
git commit -m "feat(tmux): wrappers for session/pane operations"
```

---

## Task 9: Claude CLI version check

**Files:**
- Create: `src/claude-detect.ts`

- [ ] **Step 1: Implement `src/claude-detect.ts`**

```typescript
import { execa } from 'execa';

export interface ClaudeInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

const MIN_MAJOR = 2;
const MIN_MINOR = 1;

export async function detectClaude(): Promise<ClaudeInfo> {
  let stdout: string;
  try {
    const result = await execa('claude', ['--version']);
    stdout = result.stdout;
  } catch (err) {
    throw new Error(
      `Failed to run \`claude --version\`. Is Claude Code installed and on PATH?\nDetails: ${(err as Error).message}`,
    );
  }

  // Match a semver-shaped substring in the output (claude prints e.g. "2.1.128 (Claude Code)").
  const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse Claude Code version from output: ${stdout}`);
  }
  const [, majS, minS, patS] = match;
  const major = Number(majS);
  const minor = Number(minS);
  const patch = Number(patS);

  if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
    throw new Error(
      `NFO requires Claude Code ${MIN_MAJOR}.${MIN_MINOR}.0 or newer, found ${major}.${minor}.${patch}. ` +
      `Run \`npm i -g @anthropic-ai/claude-code\` (or your package manager equivalent) to upgrade.`,
    );
  }

  return { version: `${major}.${minor}.${patch}`, major, minor, patch };
}
```

Note: `MIN_MAJOR`/`MIN_MINOR` are conservative defaults. The exact minimum is in §12.2 of the spec as an open question — bump these in implementation if needed.

- [ ] **Step 2: Manual smoke check**

Run from project root (no automated test — depends on installed claude version): `npm run dev -- --help`. Should not crash. Then create a tiny scratch script importing `detectClaude` and run it; should print the version.

This task ships without unit tests because mocking `execa` for one function feels low-value and the function is small + self-documenting. Acceptable tradeoff.

- [ ] **Step 3: Commit**

```bash
git add src/claude-detect.ts
git commit -m "feat(claude-detect): version probe with minimum-version gate"
```

---

## Task 10: Orchestrator role prompt

**Files:**
- Create: `src/prompts/orchestrator-role.ts`

- [ ] **Step 1: Create `src/prompts/orchestrator-role.ts`**

```typescript
/**
 * The system prompt addendum injected into the Orchestrator's claude session.
 *
 * Phase 1 keeps this minimal: there is no MCP server yet, no musicians yet.
 * The Orchestrator is just an annotated Claude Code session. Phase 2 will
 * replace this with a version that documents the NFO MCP tool surface.
 */
export const ORCHESTRATOR_ROLE_PROMPT_V1 = `You are the Orchestrator of an NFO orchestra.

NFO (NoFluffOrchestra) is a TUI for multi-agent work on the user's repository.
In a future phase you will be able to spawn and coordinate Musicians (other
LLM agents) via MCP tools. Right now (Phase 1), the orchestra has no Musicians
yet and no NFO-specific tools are available — you are a regular Claude Code
session augmented only with this role addendum.

For now, behave as the user's primary assistant for this project. The user
will type into your pane. Your normal Claude Code tools (Read, Edit, Write,
Bash, etc.) work as expected. CLAUDE.md and project skills load normally.
`;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/prompts/orchestrator-role.ts
git commit -m "feat(prompts): orchestrator role addendum (phase 1)"
```

---

## Task 11: Launch command — happy path (in a repo, no prior orchestra)

**Files:**
- Create: `tests/commands/launch.test.ts`
- Create: `src/commands/launch.ts`
- Modify: `src/cli.ts`

This task implements the most common entry: `nfo` in a git repo that has no orchestra yet. Other launch branches (existing orchestra in repo, no-repo with orchestras, no-repo no orchestras) are added in Task 12.

- [ ] **Step 1: Write the failing test**

`tests/commands/launch.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { launch } from '../../src/commands/launch.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { readState } from '../../src/state.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { sessionExists, killSession, sessionName } from '../../src/tmux.js';

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

  it('creates an orchestra and a tmux session in dry-run mode', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const result = await launch({
      cwd: repo.path,
      interactive: false,            // skip the permission prompt
      permissionLevel: 'supervised',  // pre-supplied in non-interactive mode
      dryRun: true,                   // don't actually attach; just verify state and session
    });

    expect(result.action).toBe('created');
    expect(result.orchestraId).toBe(projectKeyFromPath(repo.path));

    sessionsToKill.push(sessionName(result.orchestraId));

    // State file exists with expected fields
    const state = await readState(result.orchestraId);
    expect(state).not.toBeNull();
    expect(state!.project_path).toBe(repo.path);
    expect(state!.permission_level).toBe('supervised');

    // tmux session exists
    expect(await sessionExists(sessionName(result.orchestraId))).toBe(true);
  });
});
```

Note: `dryRun: true` and `interactive: false` are explicit test seams. In production CLI use both default to false/true respectively.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- launch`
Expected: FAIL.

- [ ] **Step 3: Implement `src/commands/launch.ts`**

```typescript
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { resolveRepoRoot } from '../repo.js';
import { projectKeyFromPath } from '../project-key.js';
import { ensureOrchestraDir, readState, writeState } from '../state.js';
import { makeInitialState } from '../state.types.js';
import {
  isPermissionLevel,
  claudeFlagsForLevel,
  type PermissionLevel,
} from '../permission.js';
import {
  sessionName,
  sessionExists,
  createDetachedSession,
  splitWindowHorizontal,
  sendKeys,
  attachSession,
  setSessionOption,
} from '../tmux.js';
import { ORCHESTRATOR_ROLE_PROMPT_V1 } from '../prompts/orchestrator-role.js';
import { orchestraDir } from '../config.js';

export interface LaunchOptions {
  cwd: string;
  interactive?: boolean;          // when false, must supply permissionLevel
  permissionLevel?: PermissionLevel;
  dryRun?: boolean;               // when true, do not attach
}

export interface LaunchResult {
  action: 'created' | 'attached' | 'restored';
  orchestraId: string;
}

export async function launch(opts: LaunchOptions): Promise<LaunchResult> {
  const repoRoot = await resolveRepoRoot(opts.cwd);
  if (!repoRoot) {
    // Phase 1: out-of-repo handling is covered in Task 12.
    throw new Error('Phase 1 launch requires being inside a git repository. Open NFO in a repo.');
  }

  const orchestraId = projectKeyFromPath(repoRoot);
  const existing = await readState(orchestraId);

  if (existing) {
    // Spec §4.1 branch 1: attach to existing orchestra. Phase 1 minimal handling.
    const name = sessionName(orchestraId);
    if (await sessionExists(name)) {
      if (!opts.dryRun) await attachSession(name);
      return { action: 'attached', orchestraId };
    }
    // Session is dead; Task 13 handles restore. For now, error explicitly.
    throw new Error(
      `Orchestra ${orchestraId} exists but its tmux session is gone. Run \`nfo restore ${orchestraId}\`.`,
    );
  }

  // Creating a brand new orchestra.
  const level = opts.permissionLevel ?? 'supervised';
  if (!isPermissionLevel(level)) {
    throw new Error(`Invalid permission level: ${level}`);
  }
  // Interactive prompt (with auto confirmation gate) lives in cli.ts;
  // by the time we reach this function, the level is already chosen.

  await ensureOrchestraDir(orchestraId);
  const state = makeInitialState({
    orchestraId,
    projectPath: repoRoot,
    permissionLevel: level,
  });
  await writeState(orchestraId, state);

  // Write the role prompt to disk so claude can --append-system-prompt-file it.
  const promptFile = join(orchestraDir(orchestraId), 'orchestrator-prompt.md');
  await writeFile(promptFile, ORCHESTRATOR_ROLE_PROMPT_V1, 'utf8');

  // Create the tmux session.
  const name = sessionName(orchestraId);
  await createDetachedSession(name, repoRoot);
  await setSessionOption(name, 'mouse', 'on');
  await setSessionOption(name, 'status-position', 'top');

  // Right pane placeholder for Phase 1 (the Ink TUI ships in Phase 3).
  const placeholderShell = `bash -c 'echo "NFO Auditorium pane (placeholder — Phase 3 ships the Ink TUI)" && echo "Orchestra: ${orchestraId}" && echo "Permission: ${level}" && exec ${process.env.SHELL ?? '/bin/bash'}'`;
  await splitWindowHorizontal(`${name}:0`, 35, placeholderShell);

  // Start the Orchestrator's claude session in the left pane.
  const claudeFlags = claudeFlagsForLevel(level);
  const claudeCmd = [
    'claude',
    ...claudeFlags,
    '--append-system-prompt-file',
    promptFile,
  ].join(' ');
  // The new-session opened in the current shell; send the claude command to pane 0.
  await sendKeys(`${name}:0.0`, claudeCmd, true);

  if (!opts.dryRun) {
    await attachSession(name);
  }

  return { action: 'created', orchestraId };
}
```

- [ ] **Step 4: Wire commander in `src/cli.ts`**

Replace the contents of `src/cli.ts` with:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { launch } from './commands/launch.js';
import { isPermissionLevel, AUTO_CONFIRM_PHRASE, AUTO_WARNING, type PermissionLevel } from './permission.js';
import { detectClaude } from './claude-detect.js';
import { createInterface } from 'node:readline/promises';

const program = new Command();
program
  .name('nfo')
  .description('NoFluffOrchestra — TUI multi-agent orchestrator')
  .version('0.0.0');

program
  .action(async () => {
    await detectClaude();
    const level = await promptPermissionLevel();
    await launch({ cwd: process.cwd(), interactive: true, permissionLevel: level });
  });

program.parseAsync(process.argv);

async function promptPermissionLevel(): Promise<PermissionLevel> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(
      'Permission level for this orchestra:\n' +
      '  1) auto        — RISKY: bypasses all permission checks\n' +
      '  2) autonomous  — auto-accept edits, prompt on risky tools\n' +
      '  3) supervised  — claude\'s default prompt-on-risky behavior\n' +
      '  4) strict      — read-only / plan mode\n' +
      'Choose [1-4] (default 3): ',
    )).trim();

    const map: Record<string, PermissionLevel> = {
      '1': 'auto', '2': 'autonomous', '3': 'supervised', '4': 'strict', '': 'supervised',
    };
    const level = map[ans];
    if (!level || !isPermissionLevel(level)) {
      throw new Error(`Invalid choice: ${ans}`);
    }

    if (level === 'auto') {
      console.log('\n' + AUTO_WARNING + '\n');
      const confirm = (await rl.question('> ')).trim();
      if (confirm !== AUTO_CONFIRM_PHRASE) {
        throw new Error('Auto mode not confirmed. Aborting.');
      }
    }

    return level;
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- launch`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

In a throwaway repo:
```
cd /tmp && rm -rf nfo-smoke && git init nfo-smoke && cd nfo-smoke && git commit --allow-empty -m init
NFO_HOME=/tmp/nfo-smoke-home npm --prefix <path-to-nfo> run dev -- 
```

Choose `3` for supervised. You should land in tmux with a claude session on the left and a placeholder on the right. Detach with `prefix d`.

- [ ] **Step 7: Commit**

```bash
git add src/commands/launch.ts src/cli.ts tests/commands/launch.test.ts
git commit -m "feat(launch): create+attach orchestra in a git repo"
```

---

## Task 12: Launch — out-of-repo branches

**Files:**
- Modify: `src/commands/launch.ts`
- Create: `src/commands/list.ts`
- Modify: `src/cli.ts`
- Create: `tests/commands/list.test.ts`

- [ ] **Step 1: Implement `src/commands/list.ts`**

```typescript
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PROJECTS_DIR } from '../config.js';
import { readState } from '../state.js';
import { sessionExists, sessionName } from '../tmux.js';
import type { OrchestraState } from '../state.types.js';

export interface OrchestraSummary {
  id: string;
  project_path: string;
  permission_level: string;
  created_at: string;
  running: boolean;
  musician_count: number;
}

export async function listOrchestras(): Promise<OrchestraSummary[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const dirs = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const summaries: OrchestraSummary[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const state = await readState(d.name);
    if (!state) continue;
    summaries.push({
      id: state.orchestra_id,
      project_path: state.project_path,
      permission_level: state.permission_level,
      created_at: state.created_at,
      running: await sessionExists(sessionName(state.orchestra_id)),
      musician_count: state.musicians.length,
    });
  }
  return summaries;
}

export function formatOrchestraList(summaries: OrchestraSummary[]): string {
  if (summaries.length === 0) return 'No orchestras found.';
  const rows = summaries.map(s =>
    `${s.running ? '●' : '○'}  ${s.id}\n   ${s.project_path}\n   level=${s.permission_level} musicians=${s.musician_count}`,
  );
  return rows.join('\n\n');
}
```

- [ ] **Step 2: Write the list test**

`tests/commands/list.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listOrchestras } from '../../src/commands/list.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';

describe('listOrchestras', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('returns empty array when no orchestras exist', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    expect(await listOrchestras()).toEqual([]);
  });

  it('lists all orchestras with summary info', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;

    await ensureOrchestraDir('aaa-one');
    await writeState('aaa-one', makeInitialState({
      orchestraId: 'aaa-one',
      projectPath: '/tmp/one',
      permissionLevel: 'supervised',
    }));
    await ensureOrchestraDir('bbb-two');
    await writeState('bbb-two', makeInitialState({
      orchestraId: 'bbb-two',
      projectPath: '/tmp/two',
      permissionLevel: 'autonomous',
    }));

    const list = await listOrchestras();
    expect(list).toHaveLength(2);
    const ids = list.map(o => o.id).sort();
    expect(ids).toEqual(['aaa-one', 'bbb-two']);
  });
});
```

Run: `npm test -- list`
Expected: PASS.

- [ ] **Step 3: Modify `src/commands/launch.ts` for out-of-repo branches**

Replace the `if (!repoRoot)` block (currently throws) with a delegation to a new helper. Add this near the top of the file:

```typescript
import { listOrchestras } from './list.js';
import { attachOrRestore } from './attach.js';  // created in Task 13
```

And replace the `if (!repoRoot)` block with:

```typescript
  if (!repoRoot) {
    const summaries = await listOrchestras();
    if (summaries.length === 0) {
      throw new Error('Open NFO in a git repository to create your first orchestra.');
    }
    const running = summaries.filter(s => s.running);
    if (running.length === 1) {
      return attachOrRestore(running[0].id, opts.dryRun);
    }
    // Multiple orchestras (running or not) — Phase 1 lists them and asks the user to pick by id.
    // The interactive picker UI lives in cli.ts; the launch() function itself returns a marker.
    throw new PickerRequiredError(summaries);
  }
```

And add at the top:

```typescript
export class PickerRequiredError extends Error {
  constructor(public summaries: import('./list.js').OrchestraSummary[]) {
    super('PICKER_REQUIRED');
    this.name = 'PickerRequiredError';
  }
}
```

Note: `attachOrRestore` is implemented in Task 13. To keep this task buildable without it, also export a temporary stub for now and replace it in Task 13:

For Phase 1 Task 12, stub `src/commands/attach.ts` minimally:

```typescript
import type { LaunchResult } from './launch.js';
import { sessionExists, sessionName, attachSession } from '../tmux.js';

export async function attachOrRestore(orchestraId: string, dryRun?: boolean): Promise<LaunchResult> {
  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    if (!dryRun) await attachSession(name);
    return { action: 'attached', orchestraId };
  }
  throw new Error(
    `Orchestra ${orchestraId} is stopped. Run \`nfo restore ${orchestraId}\` to bring it back. (Restore is implemented in Task 13.)`,
  );
}
```

(Task 13 expands this with real restoration.)

- [ ] **Step 4: Refactor `launch.ts` into decide+execute, and wire the CLI cleanly**

The control-flow problem: we should only prompt for a permission level when we're actually about to create a new orchestra, not when we're attaching or about to show a picker. Split the work.

Add a `decideAction` function to `src/commands/launch.ts` that returns what to do without doing it:

```typescript
export type LaunchDecision =
  | { kind: 'create'; orchestraId: string; repoRoot: string }
  | { kind: 'attach_existing'; orchestraId: string }
  | { kind: 'pick'; summaries: import('./list.js').OrchestraSummary[] }
  | { kind: 'error'; message: string };

export async function decideAction(cwd: string): Promise<LaunchDecision> {
  const repoRoot = await resolveRepoRoot(cwd);

  if (repoRoot) {
    const orchestraId = projectKeyFromPath(repoRoot);
    const existing = await readState(orchestraId);
    if (existing) {
      return { kind: 'attach_existing', orchestraId };
    }
    return { kind: 'create', orchestraId, repoRoot };
  }

  // Out of repo. Inspect known orchestras.
  const summaries = await listOrchestras();
  if (summaries.length === 0) {
    return { kind: 'error', message: 'Open NFO in a git repository to create your first orchestra.' };
  }
  const running = summaries.filter(s => s.running);
  if (running.length === 1) {
    return { kind: 'attach_existing', orchestraId: running[0].id };
  }
  return { kind: 'pick', summaries };
}
```

Keep the existing `launch()` for the create flow — but trim it down to only the create case (refactored signature):

```typescript
export interface CreateOrchestraOptions {
  repoRoot: string;
  orchestraId: string;
  permissionLevel: PermissionLevel;
  dryRun?: boolean;
}

export async function createOrchestra(opts: CreateOrchestraOptions): Promise<LaunchResult> {
  await ensureOrchestraDir(opts.orchestraId);
  const state = makeInitialState({
    orchestraId: opts.orchestraId,
    projectPath: opts.repoRoot,
    permissionLevel: opts.permissionLevel,
  });
  await writeState(opts.orchestraId, state);

  const promptFile = join(orchestraDir(opts.orchestraId), 'orchestrator-prompt.md');
  await writeFile(promptFile, ORCHESTRATOR_ROLE_PROMPT_V1, 'utf8');

  const name = sessionName(opts.orchestraId);
  await createDetachedSession(name, opts.repoRoot);
  await setSessionOption(name, 'mouse', 'on');
  await setSessionOption(name, 'status-position', 'top');

  const placeholderShell = `bash -c 'echo "NFO Auditorium pane (placeholder — Phase 3 ships the Ink TUI)" && echo "Orchestra: ${opts.orchestraId}" && echo "Permission: ${opts.permissionLevel}" && exec ${process.env.SHELL ?? '/bin/bash'}'`;
  await splitWindowHorizontal(`${name}:0`, 35, placeholderShell);

  const claudeFlags = claudeFlagsForLevel(opts.permissionLevel);
  const claudeCmd = ['claude', ...claudeFlags, '--append-system-prompt-file', promptFile].join(' ');
  await sendKeys(`${name}:0.0`, claudeCmd, true);

  if (!opts.dryRun) await attachSession(name);
  return { action: 'created', orchestraId: opts.orchestraId };
}
```

Delete the old monolithic `launch()` body — it's now expressed as `decideAction()` + (`createOrchestra()` | `attachOrRestore()`). Update the Task 11 launch test to drive `createOrchestra` directly (rename test file to `tests/commands/create-orchestra.test.ts` and adjust imports — same assertions, different function name).

Now in `src/cli.ts`, the default action becomes:

```typescript
program
  .argument('[id]', 'Orchestra id to attach (optional)')
  .action(async (id: string | undefined) => {
    await detectClaude();
    try {
      if (id) {
        await attachOrRestore(id);
        return;
      }
      const decision = await decideAction(process.cwd());
      switch (decision.kind) {
        case 'create': {
          const level = await promptPermissionLevel();
          await createOrchestra({
            repoRoot: decision.repoRoot,
            orchestraId: decision.orchestraId,
            permissionLevel: level,
          });
          return;
        }
        case 'attach_existing':
          await attachOrRestore(decision.orchestraId);
          return;
        case 'pick': {
          const picked = await promptOrchestraPicker(decision.summaries);
          await attachOrRestore(picked);
          return;
        }
        case 'error':
          console.error(decision.message);
          process.exit(1);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
```

Imports at the top of `cli.ts`:

```typescript
import { decideAction, createOrchestra } from './commands/launch.js';
import { attachOrRestore } from './commands/attach.js';
import type { OrchestraSummary } from './commands/list.js';
```

Note: with `program.argument('[id]', ...)` set on the top-level program, subcommands (`list`, `kill`, `restore`, `notes`) still work as long as they're declared before `program.parseAsync()`. Commander treats subcommands with precedence over positional args.

Also in `attach.ts`, change the type import to `import type` to avoid a value-level circular import with launch.ts:

```typescript
import type { LaunchResult } from './launch.js';
```

Helper for the picker:

```typescript
async function promptOrchestraPicker(summaries: OrchestraSummary[]): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Multiple orchestras found:');
    summaries.forEach((s, i) => {
      console.log(`  ${i + 1}) ${s.running ? '●' : '○'} ${s.id}  (${s.project_path})`);
    });
    const choice = (await rl.question('Pick one [1-N]: ')).trim();
    const idx = Number(choice) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= summaries.length) {
      throw new Error('Invalid choice');
    }
    return summaries[idx].id;
  } finally {
    rl.close();
  }
}
```

Also import the missing symbols at the top of `cli.ts`:

```typescript
import { PickerRequiredError } from './commands/launch.js';
import { attachOrRestore } from './commands/attach.js';
import { listOrchestras, type OrchestraSummary } from './commands/list.js';
```

- [ ] **Step 5: Add `nfo list` and `nfo <id>` subcommands**

In `cli.ts`, add after the default action:

```typescript
program
  .command('list')
  .description('List all known orchestras')
  .action(async () => {
    const { listOrchestras, formatOrchestraList } = await import('./commands/list.js');
    const summaries = await listOrchestras();
    console.log(formatOrchestraList(summaries));
  });

program
  .arguments('[id]')
  .action(async (id?: string) => {
    if (!id) return; // default action above handles no-args
    await attachOrRestore(id);
  });
```

(Commander's arguments syntax can collide with the default `action`. If during smoke testing you find that `nfo` with no args triggers the `[id]` action incorrectly, restructure as explicit subcommands instead. Note this and adapt.)

- [ ] **Step 6: Smoke test out-of-repo**

```
NFO_HOME=/tmp/nfo-smoke-home npm --prefix <path> run dev -- list
```

Expected: prints `No orchestras found.` (if you haven't created any).

After Task 11's smoke test left one orchestra, the same command prints it.

- [ ] **Step 7: Commit**

```bash
git add src/commands/launch.ts src/commands/list.ts src/commands/attach.ts src/cli.ts tests/commands/list.test.ts
git commit -m "feat(launch): out-of-repo branches and picker; add nfo list/attach"
```

---

## Task 13: Restore command (and split launch())

**Files:**
- Modify: `src/commands/attach.ts`
- Create: `src/commands/restore.ts`
- Modify: `src/commands/launch.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement `src/commands/restore.ts`**

```typescript
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from '../state.js';
import { orchestraDir } from '../config.js';
import {
  sessionName,
  sessionExists,
  createDetachedSession,
  splitWindowHorizontal,
  sendKeys,
  setSessionOption,
  attachSession,
} from '../tmux.js';
import { claudeFlagsForLevel } from '../permission.js';
import type { LaunchResult } from './launch.js';

export async function restoreOrchestra(
  orchestraId: string,
  dryRun?: boolean,
): Promise<LaunchResult> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    if (!dryRun) await attachSession(name);
    return { action: 'attached', orchestraId };
  }

  // Spec §4.3: recreate the tmux session, --resume the Orchestrator.
  await createDetachedSession(name, state.project_path);
  await setSessionOption(name, 'mouse', 'on');
  await setSessionOption(name, 'status-position', 'top');

  const placeholderShell = `bash -c 'echo "NFO Auditorium pane (placeholder)" && echo "Restored orchestra ${orchestraId}" && exec ${process.env.SHELL ?? '/bin/bash'}'`;
  await splitWindowHorizontal(`${name}:0`, 35, placeholderShell);

  const promptFile = join(orchestraDir(orchestraId), 'orchestrator-prompt.md');
  const flags = claudeFlagsForLevel(state.permission_level);
  const resumeArgs = state.orchestrator_session_id
    ? ['--resume', state.orchestrator_session_id]
    : [];
  const cmd = ['claude', ...flags, ...resumeArgs];
  if (existsSync(promptFile)) {
    cmd.push('--append-system-prompt-file', promptFile);
  }
  await sendKeys(`${name}:0.0`, cmd.join(' '), true);

  // Phase 1: no musicians to restore (they arrive in Phase 2).

  if (!dryRun) await attachSession(name);
  return { action: 'restored', orchestraId };
}
```

- [ ] **Step 2: Update `src/commands/attach.ts` to delegate to restore**

Replace the stub with:

```typescript
import type { LaunchResult } from './launch.js';
import { sessionExists, sessionName, attachSession } from '../tmux.js';
import { restoreOrchestra } from './restore.js';
import { readState } from '../state.js';

export async function attachOrRestore(orchestraId: string, dryRun?: boolean): Promise<LaunchResult> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    if (!dryRun) await attachSession(name);
    return { action: 'attached', orchestraId };
  }
  return restoreOrchestra(orchestraId, dryRun);
}
```

- [ ] **Step 3: Update `src/commands/launch.ts` to delegate when session is dead**

Remove the `throw new Error('Orchestra ... session is gone')` line; replace with:

```typescript
    return restoreOrchestra(orchestraId, opts.dryRun);
```

Add the import at the top:

```typescript
import { restoreOrchestra } from './restore.js';
```

- [ ] **Step 4: Add `nfo restore` command in `src/cli.ts`**

```typescript
program
  .command('restore <id>')
  .description('Force-restore a stopped orchestra')
  .action(async (id: string) => {
    const { restoreOrchestra } = await import('./commands/restore.js');
    await restoreOrchestra(id);
  });
```

- [ ] **Step 5: Manual smoke test**

After Task 11's smoke leaves an orchestra running, in a new terminal: `tmux kill-server` to simulate a reboot. Then run `nfo <id>` (or `nfo` in the repo) — should restore the session and put you back in.

- [ ] **Step 6: Commit**

```bash
git add src/commands/restore.ts src/commands/attach.ts src/commands/launch.ts src/cli.ts
git commit -m "feat(restore): rebuild tmux session and resume Orchestrator"
```

---

## Task 14: Kill command

**Files:**
- Create: `src/commands/kill.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement `src/commands/kill.ts`**

```typescript
import { createInterface } from 'node:readline/promises';
import { rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readState, writeState } from '../state.js';
import {
  sessionName,
  sessionExists,
  killSession,
} from '../tmux.js';
import { orchestraDir, archiveDir, stateFile } from '../config.js';

export interface KillOptions {
  yes?: boolean;  // skip confirmation prompt
}

export async function killOrchestra(orchestraId: string, opts: KillOptions = {}): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = (await rl.question(
        `Kill orchestra ${orchestraId} (${state.project_path})? [y/N] `,
      )).trim().toLowerCase();
      if (ans !== 'y' && ans !== 'yes') {
        console.log('Aborted.');
        return;
      }
    } finally {
      rl.close();
    }
  }

  // Phase 1: no musicians (and therefore no worktrees to handle).
  // Phase 2 will add the worktree-archive prompt.

  const name = sessionName(orchestraId);
  if (await sessionExists(name)) {
    await killSession(name);
  }

  // Archive state.json under archive/state-<timestamp>.json so notes/ stays intact.
  await mkdir(archiveDir(orchestraId), { recursive: true });
  const archived = join(archiveDir(orchestraId), `state-${Date.now()}.json`);
  if (existsSync(stateFile(orchestraId))) {
    await rename(stateFile(orchestraId), archived);
  }
}
```

- [ ] **Step 2: Add `nfo kill` to `src/cli.ts`**

```typescript
program
  .command('kill <id>')
  .description('Tear down an orchestra (state archived, notes preserved)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (id: string, opts: { yes?: boolean }) => {
    const { killOrchestra } = await import('./commands/kill.js');
    await killOrchestra(id, opts);
  });
```

- [ ] **Step 3: Manual smoke test**

```
nfo kill <id-from-list>
```

Confirm yes. Then `nfo list` — the orchestra should be gone (state archived to `archive/state-<ts>.json`; the orchestra dir itself remains so notes survive).

- [ ] **Step 4: Commit**

```bash
git add src/commands/kill.ts src/cli.ts
git commit -m "feat(kill): tear down orchestra, archive state, preserve notes"
```

---

## Task 15: Notes command

**Files:**
- Create: `src/commands/notes.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement `src/commands/notes.ts`**

```typescript
import { existsSync } from 'node:fs';
import { execa } from 'execa';
import { notesDir } from '../config.js';
import { readState } from '../state.js';

export async function openNotes(orchestraId: string): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const dir = notesDir(orchestraId);
  if (!existsSync(dir)) {
    throw new Error(`Notes directory missing for ${orchestraId}: ${dir}`);
  }

  const editor = process.env.EDITOR ?? 'vi';
  // Open the dir, not a specific file — the user picks which note to edit.
  await execa(editor, [dir], { stdio: 'inherit' });
}
```

- [ ] **Step 2: Add `nfo notes` to `src/cli.ts`**

```typescript
program
  .command('notes <id>')
  .description('Open the orchestra\'s notes/ directory in $EDITOR')
  .action(async (id: string) => {
    const { openNotes } = await import('./commands/notes.js');
    await openNotes(id);
  });
```

- [ ] **Step 3: Manual smoke test**

```
EDITOR=ls nfo notes <id>
```

Expected: lists the contents of the notes dir (empty in Phase 1 since the Orchestrator can't write notes yet).

- [ ] **Step 4: Commit**

```bash
git add src/commands/notes.ts src/cli.ts
git commit -m "feat(notes): nfo notes opens the orchestra notes/ in \$EDITOR"
```

---

## Task 16: Wire up minimal README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# NFO — NoFluffOrchestra

A TUI multi-agent orchestrator that latches onto your existing repos. Built on Claude Code + tmux.

## Status

Phase 1 (bootstrap). The `nfo` command can create/attach/restore/list/kill an Orchestra and launch the Orchestrator's `claude` session in a tmux pane. Musicians, the Ink TUI side pane, and permission-prompt detection ship in later phases.

## Requirements

- Node.js 20+
- `tmux` on PATH
- `claude` (Claude Code CLI) on PATH, version ≥ 2.1 (see `src/claude-detect.ts` for the exact gate)
- A POSIX shell (`bash` or `zsh`)
- Linux or macOS (Windows via WSL only)

## Install (development)

```
git clone <this repo>
cd nfo-cli
npm install
npm run build
npm link    # makes the `nfo` command globally available
```

## Use

In a git repo: `nfo`
List orchestras: `nfo list`
Attach by id: `nfo <id>`
Tear down: `nfo kill <id>`
Open notes: `nfo notes <id>`

## Design

See `docs/specs/2026-05-29-nfo-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: minimal README for Phase 1"
```

---

## Task 17: Final end-to-end manual smoke

Not a code task — a verification gate before declaring Phase 1 done.

- [ ] **Step 1: Run the full e2e flow in a throwaway environment**

```bash
# Fresh environment
export NFO_HOME=/tmp/nfo-e2e-home
rm -rf "$NFO_HOME" /tmp/nfo-e2e-repo
mkdir /tmp/nfo-e2e-repo && cd /tmp/nfo-e2e-repo
git init -q && git commit --allow-empty -m init

# 1. Create
nfo
# Pick option 3 (supervised). You should land in tmux with a claude session left, placeholder right.
# Type something at claude. Then detach with `prefix d`.

# 2. List
nfo list
# Should show one orchestra, ●  marker for "running".

# 3. Re-enter from inside the repo
nfo
# Should re-attach to the same session.

# 4. Re-enter by id from outside the repo
cd /tmp
nfo list   # capture the id
nfo <id>
# Should re-attach.

# 5. Simulate reboot
tmux kill-server
nfo <id>
# Should restore the orchestra (--resume the Orchestrator).

# 6. Tear down
nfo kill <id> -y
nfo list
# Should show "No orchestras found."

# 7. Out-of-repo with no orchestras
cd /tmp
NFO_HOME=$(mktemp -d) nfo
# Should error: "Open NFO in a git repository to create your first orchestra."
```

- [ ] **Step 2: Run the test suite one more time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Mark Phase 1 complete**

```bash
git tag phase-1-complete
git log --oneline | head -20    # sanity check
```

Phase 2 (NFO MCP server + Musicians + worktrees) gets its own plan.
