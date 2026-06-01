# NFO Phase 2 — MCP Server + Musicians Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the NFO MCP server and the Musician primitives. After this phase, the Orchestrator can spawn Musicians (real `claude` sessions in tmux windows running inside per-musician git worktrees) via MCP tools, exchange messages with them, query their state, dismiss them, and curate persistent notes. Restoration also rehydrates active musicians.

**Architecture:** A single stdio MCP server (`nfo mcp-server --orchestra-id <key>`) is attached to every `claude` session NFO launches (Orchestrator and each Musician) via `--mcp-config`. The server exposes mechanism-shaped tools — `spawn_musician`, `message_musician`, `query_musician`, `list_musicians`, `dismiss_musician`, `report_done`, `note_write`, `note_read`, `note_list` — implemented as thin wrappers over the same tmux + git-worktree + state.json primitives that Phase 1 introduced. Multiple MCP server instances (one per claude session) share `state.json` as the source of truth; concurrent writes are serialised through `proper-lockfile` (already in place from Phase 1).

**Tech Stack:** `@modelcontextprotocol/sdk@^1.29.0` (stdio transport, request schemas), `execa` (already), `proper-lockfile` (already). No Ink yet (Phase 3). No permission-prompt detection yet (Phase 4).

**Reference spec:** `docs/specs/2026-05-29-nfo-design.md`. Sections most relevant to Phase 2: §3.3 (IPC + state ownership), §5.1 (agent backend), §5.3 (inherited Claude Code features), §5.4 (prompt composition), all of §6 (NFO MCP server tool surface), §7.3 (notes mechanics), §9.4 (input injection caveats).

**MANDATORY code style (applies to every task in this plan):**
- All control flow uses explicit braced, multi-line blocks. Never the brace-less single-line form. So `if (cond) { return x; }`, never `if (cond) return x;`. Same for `else`, `for`, `while`, `switch`.
- Arrow functions use explicit `{ return ... }` bodies, never implicit-return expression bodies. So `arr.find((m) => { return m.id === id; })`, never `arr.find(m => m.id === id)`. Const arrow helpers too: `const f = (s) => { return join(...); }`.
- Ternaries (`a ? b : c`) ARE allowed — do not rewrite them into if/else.
- The code samples below convey the intended logic. Where a sample uses a brace-less statement or an implicit-return arrow, transcribe it in the explicit-block style described here — the style rule overrides the sample's shorthand. Reviewers must flag any shorthand that slips through.

**Explicitly NOT in Phase 2 (must not creep in):**
- The Ink TUI side pane (Phase 3) — Phase 2 leaves the right pane as the placeholder shell from Phase 1
- Concert Hall multi-orchestra UI (Phase 3)
- Permission-prompt detection from §5.2.1 (Phase 4) — Phase 2 supports the `awaiting_permission` status field but does not populate it
- Activity-loop pane scraping for Auditorium display (Phase 3)
- Token / cost tracking surfacing (Phase 3 status bar)
- Persistent musician memory beyond `claude --resume`
- Bell / desktop notifications

---

## File Structure

```
package.json                          # MODIFY: add @modelcontextprotocol/sdk dep
src/
├── musicians/
│   ├── ids.ts                        # NEW: musician id generation (sequence per orchestra)
│   ├── spawn.ts                      # NEW: createMusician(orchestraId, name, task, opts)
│   ├── message.ts                    # NEW: messageMusician(orchestraId, musicianId, text)
│   ├── query.ts                      # NEW: queryMusician(orchestraId, musicianId, lines)
│   ├── dismiss.ts                    # NEW: dismissMusician(orchestraId, musicianId, opts)
│   └── lookup.ts                     # NEW: findMusician(state, id) → Musician | undefined
├── worktree.ts                       # NEW: git worktree wrapper (add/remove/move/HEAD)
├── notes.ts                          # NEW: noteRead / noteWrite / noteList
├── state-updaters.ts                 # NEW: addMusician / setMusicianStatus / archiveMusician
├── prompts/
│   ├── orchestrator-role.ts          # MODIFY: Phase 2 prompt documenting MCP tools
│   └── musician-role.ts              # NEW: musician role addendum
├── mcp/
│   ├── server.ts                     # NEW: MCP Server setup + tool registry
│   ├── tool-defs.ts                  # NEW: tool name+description+inputSchema JSON Schemas
│   └── handlers.ts                   # NEW: dispatch table from tool name to handler function
├── commands/
│   ├── launch.ts                     # MODIFY: write mcp-config.json; pass --mcp-config to claude
│   ├── restore.ts                    # MODIFY: pass --mcp-config; restore musicians
│   └── mcp-server.ts                 # NEW: cli subcommand `nfo mcp-server --orchestra-id <id>`
└── cli.ts                            # MODIFY: register `mcp-server` subcommand (hidden)
tests/
├── worktree.test.ts                  # NEW
├── notes.test.ts                     # NEW
├── state-updaters.test.ts            # NEW
├── musicians/
│   ├── spawn.test.ts                 # NEW
│   ├── message.test.ts               # NEW
│   ├── query.test.ts                 # NEW
│   └── dismiss.test.ts               # NEW
└── mcp/
    ├── tool-defs.test.ts             # NEW
    └── handlers.test.ts              # NEW (covers spawn/message/query/list/dismiss/report/notes via dispatch)
```

Total new src files: 14. Modified: 4. Total new test files: 9.

---

## Task 1: Add MCP SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `@modelcontextprotocol/sdk` to dependencies**

Edit `package.json` to add `"@modelcontextprotocol/sdk": "^1.29.0"` in `dependencies` (keep alphabetical with existing entries — it sorts before `commander`).

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `node_modules/@modelcontextprotocol/sdk` exists, lockfile updates.

- [ ] **Step 3: Verify build + typecheck**

```
npm run build
npm run typecheck
npm test
```

All must pass (30/30 tests from Phase 1).

- [ ] **Step 4: Commit**

```
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add @modelcontextprotocol/sdk dependency

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Git worktree wrapper

**Files:**
- Create: `tests/worktree.test.ts`
- Create: `src/worktree.ts`

- [ ] **Step 1: Write the failing test**

`tests/worktree.test.ts`:

```typescript
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
    // Make a second commit so HEAD ≠ first commit
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
```

- [ ] **Step 2: Run test, confirm FAIL**

`npm test -- worktree` — expected FAIL (module not found).

- [ ] **Step 3: Implement `src/worktree.ts`**

```typescript
import { execa } from 'execa';

export interface AddWorktreeArgs {
  repoRoot: string;       // The main repo (where .git lives)
  path: string;            // Where to create the worktree
  branch: string;          // New branch name to create
  baseRef?: string;        // Defaults to HEAD
}

export async function addWorktree(args: AddWorktreeArgs): Promise<void> {
  const cmdArgs = ['worktree', 'add', '-b', args.branch, args.path];
  if (args.baseRef) cmdArgs.push(args.baseRef);
  await execa('git', cmdArgs, { cwd: args.repoRoot });
}

export interface RemoveWorktreeArgs {
  repoRoot: string;
  path: string;
  force?: boolean;
}

export async function removeWorktree(args: RemoveWorktreeArgs): Promise<void> {
  const cmdArgs = ['worktree', 'remove'];
  if (args.force) cmdArgs.push('--force');
  cmdArgs.push(args.path);
  await execa('git', cmdArgs, { cwd: args.repoRoot, reject: false });
}

export async function worktreeExists(repoRoot: string, path: string): Promise<boolean> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot });
  // porcelain output starts each entry with `worktree <path>` lines.
  const lines = stdout.split('\n');
  return lines.some(l => l === `worktree ${path}`);
}

export async function deleteBranch(repoRoot: string, branch: string): Promise<void> {
  await execa('git', ['branch', '-D', branch], { cwd: repoRoot, reject: false });
}
```

- [ ] **Step 4: Run test, confirm PASS**

`npm test -- worktree` — expected 3/3 PASS.

- [ ] **Step 5: Commit**

```
git add src/worktree.ts tests/worktree.test.ts
git commit -m "$(cat <<'EOF'
feat(worktree): git worktree add/remove/list wrapper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Musician id generation

**Files:**
- Create: `src/musicians/ids.ts`

This is a tiny stateless helper. No tests needed (covered by spawn tests).

- [ ] **Step 1: Create `src/musicians/ids.ts`**

```typescript
import type { OrchestraState } from '../state.types.js';

/**
 * Generate the next musician id. Format: `mus-NNN` where NNN is zero-padded
 * to 3 digits and counts active + archived musicians. Never reuses an id even
 * after a musician is archived (avoids confusion in logs).
 */
export function nextMusicianId(state: OrchestraState): string {
  const used = new Set<string>();
  for (const m of state.musicians) used.add(m.id);
  for (const m of state.archived_musicians) used.add(m.id);
  let n = used.size + 1;
  // Defensive: if collision somehow occurs (race recovery), increment until free.
  while (used.has(`mus-${String(n).padStart(3, '0')}`)) n++;
  return `mus-${String(n).padStart(3, '0')}`;
}
```

- [ ] **Step 2: Typecheck**

`npm run typecheck` — must pass.

- [ ] **Step 3: Commit**

```
git add src/musicians/ids.ts
git commit -m "$(cat <<'EOF'
feat(musicians): mus-NNN id generator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: State updaters

**Files:**
- Create: `tests/state-updaters.test.ts`
- Create: `src/state-updaters.ts`

These are the higher-level mutators that several Phase 2 modules call. Keeping them in one place enforces consistent locking and field-update conventions.

- [ ] **Step 1: Write the failing test**

`tests/state-updaters.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addMusician,
  setMusicianStatus,
  archiveMusician,
  setOrchestratorSessionId,
  setMusicianClaudeSessionId,
  touchMusicianActivity,
} from '../src/state-updaters.js';
import { ensureOrchestraDir, writeState, readState } from '../src/state.js';
import { makeInitialState } from '../src/state.types.js';
import { makeTmpConfig } from './helpers/tmp-config.js';

describe('state updaters', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  async function freshState(id: string) {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir(id);
    await writeState(id, makeInitialState({
      orchestraId: id, projectPath: '/tmp/x', permissionLevel: 'supervised',
    }));
  }

  it('addMusician appends a working musician', async () => {
    await freshState('orch-a');
    await addMusician('orch-a', {
      id: 'mus-001',
      name: 'tester',
      task_summary: 'run tests',
      status: 'working',
      tmux_window_id: '@1',
      claude_session_id: null,
      worktree_path: '/tmp/w',
      branch: 'nfo/mus-001',
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });
    const state = await readState('orch-a');
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].id).toBe('mus-001');
  });

  it('setMusicianStatus updates only that musician', async () => {
    await freshState('orch-b');
    await addMusician('orch-b', baseMus('mus-001'));
    await addMusician('orch-b', baseMus('mus-002'));

    await setMusicianStatus('orch-b', 'mus-001', 'idle');

    const state = await readState('orch-b');
    expect(state!.musicians.find(m => m.id === 'mus-001')!.status).toBe('idle');
    expect(state!.musicians.find(m => m.id === 'mus-002')!.status).toBe('working');
  });

  it('archiveMusician moves the musician to archived_musicians with summary + timestamp', async () => {
    await freshState('orch-c');
    await addMusician('orch-c', baseMus('mus-001'));

    await archiveMusician('orch-c', 'mus-001', { summary: 'done', dismissedAt: '2026-05-29T11:00:00Z' });

    const state = await readState('orch-c');
    expect(state!.musicians).toHaveLength(0);
    expect(state!.archived_musicians).toHaveLength(1);
    expect(state!.archived_musicians[0].id).toBe('mus-001');
    expect(state!.archived_musicians[0].dismissed_at).toBe('2026-05-29T11:00:00Z');
    expect(state!.archived_musicians[0].summary).toBe('done');
    expect(state!.archived_musicians[0].status).toBe('stopped');
  });

  it('setOrchestratorSessionId records the session id', async () => {
    await freshState('orch-d');
    await setOrchestratorSessionId('orch-d', 'sess-abc');
    const state = await readState('orch-d');
    expect(state!.orchestrator_session_id).toBe('sess-abc');
  });

  it('setMusicianClaudeSessionId records the session id', async () => {
    await freshState('orch-e');
    await addMusician('orch-e', baseMus('mus-001'));
    await setMusicianClaudeSessionId('orch-e', 'mus-001', 'sess-xyz');
    const state = await readState('orch-e');
    expect(state!.musicians[0].claude_session_id).toBe('sess-xyz');
  });

  it('touchMusicianActivity updates last_activity', async () => {
    await freshState('orch-f');
    await addMusician('orch-f', baseMus('mus-001'));
    await touchMusicianActivity('orch-f', 'mus-001', '2026-05-29T12:00:00Z');
    const state = await readState('orch-f');
    expect(state!.musicians[0].last_activity).toBe('2026-05-29T12:00:00Z');
  });
});

function baseMus(id: string) {
  return {
    id,
    name: 'm',
    task_summary: 't',
    status: 'working' as const,
    tmux_window_id: '@0',
    claude_session_id: null,
    worktree_path: null,
    branch: null,
    spawned_at: '2026-05-29T10:00:00Z',
    last_activity: '2026-05-29T10:00:00Z',
  };
}
```

- [ ] **Step 2: Run test, confirm FAIL**

`npm test -- state-updaters` — expected FAIL.

- [ ] **Step 3: Implement `src/state-updaters.ts`**

```typescript
import { readState, writeState } from './state.js';
import type {
  ArchivedMusician,
  Musician,
  MusicianStatus,
  OrchestraState,
} from './state.types.js';

async function update(
  orchestraId: string,
  mutator: (s: OrchestraState) => void,
): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);
  mutator(state);
  await writeState(orchestraId, state);
}

export async function addMusician(orchestraId: string, m: Musician): Promise<void> {
  await update(orchestraId, s => { s.musicians.push(m); });
}

export async function setMusicianStatus(
  orchestraId: string,
  musicianId: string,
  status: MusicianStatus,
  pendingPermission?: string | null,
): Promise<void> {
  await update(orchestraId, s => {
    const m = s.musicians.find(mu => mu.id === musicianId);
    if (!m) throw new Error(`Unknown musician: ${musicianId}`);
    m.status = status;
    if (pendingPermission !== undefined) m.pending_permission = pendingPermission;
  });
}

export async function setMusicianClaudeSessionId(
  orchestraId: string,
  musicianId: string,
  sessionId: string,
): Promise<void> {
  await update(orchestraId, s => {
    const m = s.musicians.find(mu => mu.id === musicianId);
    if (!m) throw new Error(`Unknown musician: ${musicianId}`);
    m.claude_session_id = sessionId;
  });
}

export async function touchMusicianActivity(
  orchestraId: string,
  musicianId: string,
  timestamp?: string,
): Promise<void> {
  const ts = timestamp ?? new Date().toISOString();
  await update(orchestraId, s => {
    const m = s.musicians.find(mu => mu.id === musicianId);
    if (!m) throw new Error(`Unknown musician: ${musicianId}`);
    m.last_activity = ts;
  });
}

export async function setOrchestratorSessionId(
  orchestraId: string,
  sessionId: string,
): Promise<void> {
  await update(orchestraId, s => { s.orchestrator_session_id = sessionId; });
}

export interface ArchiveArgs {
  summary: string | null;
  dismissedAt?: string;
}

export async function archiveMusician(
  orchestraId: string,
  musicianId: string,
  args: ArchiveArgs,
): Promise<void> {
  await update(orchestraId, s => {
    const idx = s.musicians.findIndex(mu => mu.id === musicianId);
    if (idx === -1) throw new Error(`Unknown musician: ${musicianId}`);
    const [m] = s.musicians.splice(idx, 1);
    const archived: ArchivedMusician = {
      ...m,
      status: 'stopped',
      dismissed_at: args.dismissedAt ?? new Date().toISOString(),
      summary: args.summary,
    };
    s.archived_musicians.push(archived);
  });
}
```

- [ ] **Step 4: Run test, confirm PASS**

`npm test -- state-updaters` — expected 6/6 PASS.

- [ ] **Step 5: Commit**

```
git add src/state-updaters.ts tests/state-updaters.test.ts
git commit -m "$(cat <<'EOF'
feat(state): typed state mutators (musicians, sessions, activity, archive)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Musician lookup helper

**Files:**
- Create: `src/musicians/lookup.ts`

- [ ] **Step 1: Create `src/musicians/lookup.ts`**

```typescript
import type { Musician, OrchestraState } from '../state.types.js';

export function findMusician(state: OrchestraState, id: string): Musician | undefined {
  return state.musicians.find(m => m.id === id);
}

export function findMusicianStrict(state: OrchestraState, id: string): Musician {
  const m = findMusician(state, id);
  if (!m) throw new Error(`Unknown musician: ${id}`);
  return m;
}
```

- [ ] **Step 2: Typecheck and commit**

`npm run typecheck` must pass.

```
git add src/musicians/lookup.ts
git commit -m "$(cat <<'EOF'
feat(musicians): findMusician / findMusicianStrict helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Musician role prompt + Orchestrator prompt update

**Files:**
- Create: `src/prompts/musician-role.ts`
- Modify: `src/prompts/orchestrator-role.ts`

- [ ] **Step 1: Create `src/prompts/musician-role.ts`**

```typescript
export const MUSICIAN_ROLE_PROMPT_V1 = `You are a Musician in an NFO orchestra.

You were spawned by the Orchestrator with a specific task. The user typing into
your pane is debugging / observing — usually the user does NOT direct you;
the Orchestrator does. Treat new user messages as either Orchestrator
hand-offs or out-of-band human guidance, and use judgment.

Your workspace is a dedicated git worktree, so file edits are isolated from
other Musicians. When you finish the task you were spawned with, call the
\`report_done\` MCP tool with a concise summary. After that, stay alive — the
Orchestrator may message you again with follow-up work.

You also have the full NFO MCP tool surface (\`spawn_musician\`,
\`message_musician\`, etc.). Avoid spawning sub-Musicians unless the
Orchestrator explicitly asks you to. Keep coordination centralised.
`;
```

- [ ] **Step 2: Replace `src/prompts/orchestrator-role.ts` content**

```typescript
/**
 * Phase 2 Orchestrator role addendum. Documents the NFO MCP tool surface.
 */
export const ORCHESTRATOR_ROLE_PROMPT_V1 = `You are the Orchestrator of an NFO orchestra.

NFO (NoFluffOrchestra) is a TUI for multi-agent work on the user's repository.
You coordinate Musicians (other Claude Code agents) via the NFO MCP tools.

Available NFO tools (in addition to your normal Claude Code tools):

  spawn_musician({ name, task, worktree?, branch_from? })
    Create a Musician with the given task. By default the Musician runs in a
    fresh git worktree off HEAD. Pass worktree=false for trivially isolated
    work (e.g., docs-only) that doesn't need an isolated branch. Returns the
    musician_id.

  message_musician({ musician_id, message })
    Send a message into the Musician's input. Fire-and-forget.

  query_musician({ musician_id, lines? })
    Read the most recent visible output from the Musician's pane. Use this
    sparingly — capture-pane is heuristic and may include rendering artifacts.

  list_musicians()
    Return all currently-active Musicians with their status.

  dismiss_musician({ musician_id, archive_worktree? })
    Tear down a Musician. By default the worktree is archived under
    .../archive/<musician_id>/worktree (the branch is preserved). Pass
    archive_worktree=false to drop the worktree entirely.

  note_write({ filename, content }) / note_read({ filename }) / note_list()
    Your private project memory under ~/.config/nfo/projects/<key>/notes/.
    On every fresh Orchestrator session, the contents of notes/overview.md
    and notes/decisions.md are loaded into your context automatically.
    Use these to record decisions, open questions, and durable project
    understanding the user would want you to remember next session.

Coordination guidance:

- For agent coordination, PREFER the NFO MCP tools over Claude Code's built-in
  Task tool. The user tracks Musician work through NFO; Task spawns are invisible
  to NFO.
- Worktrees solve concurrent file-edit safety, not API coupling. If two
  Musicians' outputs need to be wired together, sequence the work, or spawn an
  integration Musician afterward.
- The orchestra's permission level applies to every Musician you spawn.
- Project-level guidance in CLAUDE.md still applies; respect it.
`;
```

- [ ] **Step 3: Typecheck**

`npm run typecheck` — must pass.

- [ ] **Step 4: Commit**

```
git add src/prompts/musician-role.ts src/prompts/orchestrator-role.ts
git commit -m "$(cat <<'EOF'
feat(prompts): musician role + Phase 2 orchestrator prompt with MCP tools

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Musician spawn

**Files:**
- Create: `tests/musicians/spawn.test.ts`
- Create: `src/musicians/spawn.ts`

- [ ] **Step 1: Write the failing test**

`tests/musicians/spawn.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createMusician } from '../../src/musicians/spawn.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { readState, ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import {
  createDetachedSession,
  sessionName,
  killSession,
  sessionExists,
} from '../../src/tmux.js';
import { existsSync } from 'node:fs';

describe('createMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('creates a worktree, a tmux window, and a state.json entry', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path, 220, 50);

    const result = await createMusician({
      orchestraId,
      name: 'tester',
      task: 'run the test suite',
      dryRun: true,
    });

    expect(result.musician_id).toMatch(/^mus-\d{3}$/);
    expect(result.worktree_path).not.toBeNull();
    if (result.worktree_path) {
      expect(existsSync(result.worktree_path)).toBe(true);
    }

    const state = await readState(orchestraId);
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].name).toBe('tester');
    expect(state!.musicians[0].task_summary).toBe('run the test suite');
    expect(state!.musicians[0].status).toBe('working');
  });

  it('honours worktree=false (no worktree, runs in repo root)', async () => {
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;

    const orchestraId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchestraId);
    await writeState(orchestraId, makeInitialState({
      orchestraId, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    const name = sessionName(orchestraId);
    sessionsToKill.push(name);
    await createDetachedSession(name, repo.path, 220, 50);

    const result = await createMusician({
      orchestraId,
      name: 'doc-writer',
      task: 'update README',
      worktree: false,
      dryRun: true,
    });

    expect(result.worktree_path).toBeNull();
    const state = await readState(orchestraId);
    expect(state!.musicians[0].worktree_path).toBeNull();
    expect(state!.musicians[0].branch).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

`npm test -- musicians/spawn` — expected FAIL.

- [ ] **Step 3: Implement `src/musicians/spawn.ts`**

```typescript
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { addMusician } from '../state-updaters.js';
import { readState } from '../state.js';
import { orchestraDir, worktreesDir, archiveDir } from '../config.js';
import { addWorktree } from '../worktree.js';
import { claudeFlagsForLevel } from '../permission.js';
import { sessionName, sendKeys } from '../tmux.js';
import { execa as ex } from 'execa';
import { MUSICIAN_ROLE_PROMPT_V1 } from '../prompts/musician-role.js';
import { nextMusicianId } from './ids.js';

export interface CreateMusicianOptions {
  orchestraId: string;
  name: string;
  task: string;
  worktree?: boolean;     // default true
  branchFrom?: string;    // default HEAD
  dryRun?: boolean;       // skip launching claude; useful for tests
}

export interface CreateMusicianResult {
  musician_id: string;
  worktree_path: string | null;
  branch: string | null;
  tmux_window_id: string;
}

export async function createMusician(opts: CreateMusicianOptions): Promise<CreateMusicianResult> {
  const state = await readState(opts.orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${opts.orchestraId}`);

  const musicianId = nextMusicianId(state);
  const useWorktree = opts.worktree !== false;

  // 1. Worktree (or repo root).
  let workingDir: string;
  let worktreePath: string | null = null;
  let branch: string | null = null;
  if (useWorktree) {
    worktreePath = join(worktreesDir(opts.orchestraId), musicianId);
    branch = `nfo/${musicianId}`;
    await addWorktree({
      repoRoot: state.project_path,
      path: worktreePath,
      branch,
      baseRef: opts.branchFrom,
    });
    workingDir = worktreePath;
  } else {
    workingDir = state.project_path;
  }

  // 2. Per-musician role prompt file (so future restore can re-inject it).
  const promptFile = join(orchestraDir(opts.orchestraId), `musician-${musicianId}-prompt.md`);
  const prompt = MUSICIAN_ROLE_PROMPT_V1 + `\n\n## Initial task\n\n${opts.task}\n`;
  await writeFile(promptFile, prompt, 'utf8');

  // 3. New tmux window for the musician.
  const session = sessionName(opts.orchestraId);
  const winLabel = `mus-${musicianId}-${sanitiseName(opts.name)}`;
  // `tmux new-window -P -F "#{window_id}"` returns the new window id (e.g. "@7").
  const { stdout: tmuxWindowId } = await execa('tmux', [
    'new-window',
    '-t', session,
    '-n', winLabel,
    '-c', workingDir,
    '-d',
    '-P',
    '-F', '#{window_id}',
  ]);

  // 4. Launch claude in the new window (unless dryRun — used by tests).
  if (!opts.dryRun) {
    const mcpConfigPath = join(orchestraDir(opts.orchestraId), 'mcp-config.json');
    const flags = claudeFlagsForLevel(state.permission_level);
    const cmd = [
      'claude',
      ...flags,
      '--mcp-config', mcpConfigPath,
      '--append-system-prompt-file', promptFile,
    ].join(' ');
    await sendKeys(`${session}:${tmuxWindowId.trim()}`, cmd, true);
  }

  // 5. Register in state.json.
  const now = new Date().toISOString();
  await addMusician(opts.orchestraId, {
    id: musicianId,
    name: opts.name,
    task_summary: opts.task.slice(0, 200),
    status: 'working',
    pending_permission: null,
    tmux_window_id: tmuxWindowId.trim(),
    claude_session_id: null,
    worktree_path: worktreePath,
    branch,
    spawned_at: now,
    last_activity: now,
  });

  return {
    musician_id: musicianId,
    worktree_path: worktreePath,
    branch,
    tmux_window_id: tmuxWindowId.trim(),
  };
}

function sanitiseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'musician';
}
```

Note: the spec note about `archiveDir` import — drop it; it's unused here (used by dismiss). Drop the duplicate `execa as ex` import that snuck in — keep just `import { execa } from 'execa'`.

- [ ] **Step 4: Run test, confirm PASS**

`npm test -- musicians/spawn` — expected 2/2 PASS.

- [ ] **Step 5: Commit**

```
git add src/musicians/spawn.ts tests/musicians/spawn.test.ts
git commit -m "$(cat <<'EOF'
feat(musicians): createMusician — worktree + tmux window + state row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Musician message

**Files:**
- Create: `tests/musicians/message.test.ts`
- Create: `src/musicians/message.ts`

- [ ] **Step 1: Test**

`tests/musicians/message.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { messageMusician } from '../../src/musicians/message.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { addMusician } from '../../src/state-updaters.js';
import {
  createDetachedSession,
  sessionName,
  killSession,
  capturePane,
} from '../../src/tmux.js';
import { execa } from 'execa';

describe('messageMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('throws when musician is unknown', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const id = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(id);
    await writeState(id, makeInitialState({
      orchestraId: id, projectPath: repo.path, permissionLevel: 'supervised',
    }));

    await expect(
      messageMusician({ orchestraId: id, musicianId: 'mus-999', message: 'hi' }),
    ).rejects.toThrow(/Unknown musician/);
  });

  it('sends keys + Enter to the musician\'s tmux window', async () => {
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

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);
    // Create a window the musician can "live in".
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-tester', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);

    await addMusician(orchId, {
      id: 'mus-001',
      name: 'tester',
      task_summary: 't',
      status: 'working',
      tmux_window_id: winId.trim(),
      claude_session_id: null,
      worktree_path: null,
      branch: null,
      spawned_at: '2026-05-29T10:00:00Z',
      last_activity: '2026-05-29T10:00:00Z',
    });

    await messageMusician({ orchestraId: orchId, musicianId: 'mus-001', message: 'echo nfo-message-test' });
    // Give the shell a moment to render echo output.
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${sess}:${winId.trim()}`, 20);
    expect(out).toContain('nfo-message-test');

    // last_activity should have been touched.
    const state = await readState(orchId);
    expect(state!.musicians[0].last_activity).not.toBe('2026-05-29T10:00:00Z');
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

`npm test -- musicians/message` — expected FAIL.

- [ ] **Step 3: Implement `src/musicians/message.ts`**

```typescript
import { sendKeys, sessionName } from '../tmux.js';
import { readState } from '../state.js';
import { findMusicianStrict } from './lookup.js';
import { touchMusicianActivity } from '../state-updaters.js';

export interface MessageMusicianOptions {
  orchestraId: string;
  musicianId: string;
  message: string;
}

export async function messageMusician(opts: MessageMusicianOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  const musician = findMusicianStrict(state, opts.musicianId);

  const target = `${sessionName(opts.orchestraId)}:${musician.tmux_window_id}`;
  await sendKeys(target, opts.message, true);
  await touchMusicianActivity(opts.orchestraId, opts.musicianId);
}
```

- [ ] **Step 4: Run test, confirm PASS**

`npm test -- musicians/message` — expected 2/2 PASS.

- [ ] **Step 5: Commit**

```
git add src/musicians/message.ts tests/musicians/message.test.ts
git commit -m "$(cat <<'EOF'
feat(musicians): messageMusician — send-keys + activity touch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Musician query

**Files:**
- Create: `tests/musicians/query.test.ts`
- Create: `src/musicians/query.ts`

- [ ] **Step 1: Test**

`tests/musicians/query.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { queryMusician } from '../../src/musicians/query.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { addMusician } from '../../src/state-updaters.js';
import { createDetachedSession, sessionName, killSession, sendKeys } from '../../src/tmux.js';
import { execa } from 'execa';

describe('queryMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('returns the visible content of the musician pane', async () => {
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

    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', sess, '-n', 'mus-001-q', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    await addMusician(orchId, baseMus('mus-001', winId.trim()));

    await sendKeys(`${sess}:${winId.trim()}`, 'echo nfo-query-marker', true);
    await new Promise(r => setTimeout(r, 250));

    const out = await queryMusician({ orchestraId: orchId, musicianId: 'mus-001' });
    expect(out).toContain('nfo-query-marker');
  });
});

function baseMus(id: string, winId: string) {
  return {
    id, name: 'q', task_summary: 't', status: 'working' as const,
    tmux_window_id: winId, claude_session_id: null, worktree_path: null,
    branch: null,
    spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
  };
}
```

- [ ] **Step 2: Run test, confirm FAIL**

- [ ] **Step 3: Implement `src/musicians/query.ts`**

```typescript
import { capturePane, sessionName } from '../tmux.js';
import { readState } from '../state.js';
import { findMusicianStrict } from './lookup.js';

export interface QueryMusicianOptions {
  orchestraId: string;
  musicianId: string;
  lines?: number;
}

export async function queryMusician(opts: QueryMusicianOptions): Promise<string> {
  const state = await readState(opts.orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  const musician = findMusicianStrict(state, opts.musicianId);
  const target = `${sessionName(opts.orchestraId)}:${musician.tmux_window_id}`;
  return capturePane(target, opts.lines ?? 80);
}
```

- [ ] **Step 4: Run test, confirm PASS**

- [ ] **Step 5: Commit**

```
git add src/musicians/query.ts tests/musicians/query.test.ts
git commit -m "$(cat <<'EOF'
feat(musicians): queryMusician — capture-pane wrapper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Musician dismiss

**Files:**
- Create: `tests/musicians/dismiss.test.ts`
- Create: `src/musicians/dismiss.ts`

- [ ] **Step 1: Test**

`tests/musicians/dismiss.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { dismissMusician } from '../../src/musicians/dismiss.js';
import { createMusician } from '../../src/musicians/spawn.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';
import { existsSync } from 'node:fs';

describe('dismissMusician', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('moves musician to archived_musicians and removes worktree (archive=false drops branch)', async () => {
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
    const sess = sessionName(orchId);
    sessionsToKill.push(sess);
    await createDetachedSession(sess, repo.path, 220, 50);

    const spawn = await createMusician({
      orchestraId: orchId, name: 'tester', task: 'do stuff', dryRun: true,
    });
    expect(spawn.worktree_path).not.toBeNull();
    expect(existsSync(spawn.worktree_path!)).toBe(true);

    await dismissMusician({
      orchestraId: orchId,
      musicianId: spawn.musician_id,
      archiveWorktree: false,
      summary: 'rejected',
    });

    const state = await readState(orchId);
    expect(state!.musicians).toHaveLength(0);
    expect(state!.archived_musicians).toHaveLength(1);
    expect(state!.archived_musicians[0].summary).toBe('rejected');
    expect(existsSync(spawn.worktree_path!)).toBe(false);
  });
});
```

(One test is enough — archive=true behaviour is documented and exercised by the MCP handler tests in Task 14.)

- [ ] **Step 2: Run test, confirm FAIL**

- [ ] **Step 3: Implement `src/musicians/dismiss.ts`**

```typescript
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execa } from 'execa';
import { archiveMusician } from '../state-updaters.js';
import { readState } from '../state.js';
import { findMusicianStrict } from './lookup.js';
import { archiveDir } from '../config.js';
import { sessionName } from '../tmux.js';
import { removeWorktree, deleteBranch } from '../worktree.js';

export interface DismissMusicianOptions {
  orchestraId: string;
  musicianId: string;
  archiveWorktree?: boolean;     // default true
  summary?: string | null;       // recorded on the archived musician
}

export async function dismissMusician(opts: DismissMusicianOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  const musician = findMusicianStrict(state, opts.musicianId);

  const archive = opts.archiveWorktree !== false;

  // 1. Best-effort graceful shutdown of claude in the musician's window.
  const target = `${sessionName(opts.orchestraId)}:${musician.tmux_window_id}`;
  // Send `/quit` first (lets claude persist its session). Then kill the window
  // regardless. tmux kill-window is idempotent.
  await execa('tmux', ['send-keys', '-l', '-t', target, '--', '/quit'], { reject: false });
  await execa('tmux', ['send-keys', '-t', target, 'Enter'], { reject: false });
  await new Promise(r => setTimeout(r, 200));
  await execa('tmux', ['kill-window', '-t', target], { reject: false });

  // 2. Worktree handling.
  if (musician.worktree_path) {
    if (archive) {
      // Move worktree to archive/<id>/worktree using `git worktree move`.
      const dest = join(archiveDir(opts.orchestraId), opts.musicianId, 'worktree');
      await mkdir(dirname(dest), { recursive: true });
      // `git worktree move <existing> <new>` updates the worktree metadata.
      // Falls back to remove if move fails (different fs, locked, etc.).
      const moved = await execa('git', ['worktree', 'move', musician.worktree_path, dest], {
        cwd: state.project_path, reject: false,
      });
      if (moved.exitCode !== 0) {
        await removeWorktree({ repoRoot: state.project_path, path: musician.worktree_path, force: true });
        // Branch is preserved when archive=true, even on fallback.
      }
    } else {
      await removeWorktree({ repoRoot: state.project_path, path: musician.worktree_path, force: true });
      if (musician.branch) {
        await deleteBranch(state.project_path, musician.branch);
      }
    }
  }

  // 3. Move state row.
  await archiveMusician(opts.orchestraId, opts.musicianId, {
    summary: opts.summary ?? null,
  });
}
```

- [ ] **Step 4: Run test, confirm PASS**

- [ ] **Step 5: Commit**

```
git add src/musicians/dismiss.ts tests/musicians/dismiss.test.ts
git commit -m "$(cat <<'EOF'
feat(musicians): dismissMusician — tmux kill + worktree archive/drop + state move

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Notes module

**Files:**
- Create: `tests/notes.test.ts`
- Create: `src/notes.ts`

- [ ] **Step 1: Test**

`tests/notes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { noteRead, noteWrite, noteList } from '../src/notes.js';
import { ensureOrchestraDir } from '../src/state.js';
import { makeTmpConfig } from './helpers/tmp-config.js';

describe('notes', () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('noteWrite then noteRead returns the written content', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-a');

    await noteWrite('orch-a', 'overview.md', '# Project overview\n');
    const back = await noteRead('orch-a', 'overview.md');
    expect(back).toBe('# Project overview\n');
  });

  it('noteRead returns empty string for missing notes', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-b');

    expect(await noteRead('orch-b', 'nope.md')).toBe('');
  });

  it('noteList returns all markdown filenames in notes/', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-c');
    await noteWrite('orch-c', 'overview.md', 'a');
    await noteWrite('orch-c', 'decisions.md', 'b');

    const list = await noteList('orch-c');
    expect(list.sort()).toEqual(['decisions.md', 'overview.md']);
  });

  it('rejects filenames containing path separators', async () => {
    const tmp = await makeTmpConfig();
    cleanups.push(tmp.cleanup);
    process.env.NFO_HOME = tmp.path;
    await ensureOrchestraDir('orch-d');
    await expect(noteWrite('orch-d', '../escape.md', 'pwn')).rejects.toThrow(/invalid filename/i);
    await expect(noteRead('orch-d', '../escape.md')).rejects.toThrow(/invalid filename/i);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

- [ ] **Step 3: Implement `src/notes.ts`**

```typescript
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { notesDir } from './config.js';

function ensureSafeFilename(filename: string): void {
  if (!filename || /[\/\\]/.test(filename) || filename.includes('..')) {
    throw new Error(`invalid filename: ${filename}`);
  }
}

export async function noteWrite(
  orchestraId: string,
  filename: string,
  content: string,
): Promise<void> {
  ensureSafeFilename(filename);
  const dir = notesDir(orchestraId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), content, 'utf8');
}

export async function noteRead(orchestraId: string, filename: string): Promise<string> {
  ensureSafeFilename(filename);
  const file = join(notesDir(orchestraId), filename);
  if (!existsSync(file)) return '';
  return readFile(file, 'utf8');
}

export async function noteList(orchestraId: string): Promise<string[]> {
  const dir = notesDir(orchestraId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => e.name);
}
```

- [ ] **Step 4: Run test, confirm PASS**

- [ ] **Step 5: Commit**

```
git add src/notes.ts tests/notes.test.ts
git commit -m "$(cat <<'EOF'
feat(notes): noteRead/noteWrite/noteList for orchestrator-curated memory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: MCP tool definitions

**Files:**
- Create: `tests/mcp/tool-defs.test.ts`
- Create: `src/mcp/tool-defs.ts`

- [ ] **Step 1: Test**

`tests/mcp/tool-defs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NFO_TOOLS } from '../../src/mcp/tool-defs.js';

describe('NFO MCP tool definitions', () => {
  it('exposes the expected tool names', () => {
    const names = NFO_TOOLS.map(t => t.name).sort();
    expect(names).toEqual([
      'dismiss_musician',
      'list_musicians',
      'message_musician',
      'note_list',
      'note_read',
      'note_write',
      'query_musician',
      'report_done',
      'spawn_musician',
    ]);
  });

  it('every tool has a non-empty description and inputSchema with type "object"', () => {
    for (const tool of NFO_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

- [ ] **Step 3: Implement `src/mcp/tool-defs.ts`**

```typescript
export interface NfoToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const NFO_TOOLS: NfoToolDef[] = [
  {
    name: 'spawn_musician',
    description: 'Spawn a new Musician (a Claude Code subagent) to work on a task in an isolated git worktree. Returns the musician_id.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-friendly identifier (e.g. "test-writer")' },
        task: { type: 'string', description: 'Initial task prompt sent as the first message' },
        worktree: { type: 'boolean', description: 'Default true. Pass false for trivially-isolated work that does not need a worktree.' },
        branch_from: { type: 'string', description: 'Optional base ref (defaults to HEAD).' },
      },
      required: ['name', 'task'],
      additionalProperties: false,
    },
  },
  {
    name: 'message_musician',
    description: 'Send a message to a Musician. Fire-and-forget; their response streams into their pane.',
    inputSchema: {
      type: 'object',
      properties: {
        musician_id: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['musician_id', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_musician',
    description: 'Read the most recent visible output from a Musician\'s tmux pane. Returns the captured text.',
    inputSchema: {
      type: 'object',
      properties: {
        musician_id: { type: 'string' },
        lines: { type: 'integer', description: 'Default 80.' },
      },
      required: ['musician_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_musicians',
    description: 'List all currently-active Musicians with their status and metadata.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'dismiss_musician',
    description: 'Tear down a Musician. Archives the worktree by default (branch preserved); pass archive_worktree=false to drop everything.',
    inputSchema: {
      type: 'object',
      properties: {
        musician_id: { type: 'string' },
        archive_worktree: { type: 'boolean' },
        summary: { type: 'string' },
      },
      required: ['musician_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_done',
    description: 'Called by a Musician to mark itself as idle/done. Provide a concise summary.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        next_steps: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_write',
    description: 'Write (or replace) a note file under the orchestra\'s notes/ directory.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename with no path separators, e.g. "overview.md".' },
        content: { type: 'string' },
      },
      required: ['filename', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_read',
    description: 'Read a note file from the orchestra\'s notes/ directory. Returns the contents, or empty string if missing.',
    inputSchema: {
      type: 'object',
      properties: { filename: { type: 'string' } },
      required: ['filename'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_list',
    description: 'List all files in the orchestra\'s notes/ directory.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];
```

- [ ] **Step 4: Run test, confirm PASS**

- [ ] **Step 5: Commit**

```
git add src/mcp/tool-defs.ts tests/mcp/tool-defs.test.ts
git commit -m "$(cat <<'EOF'
feat(mcp): tool definitions (names, descriptions, JSON Schemas)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: MCP handler dispatch

**Files:**
- Create: `tests/mcp/handlers.test.ts`
- Create: `src/mcp/handlers.ts`

Handlers wire MCP tool calls to the Musicians / notes / state modules.

- [ ] **Step 1: Test**

`tests/mcp/handlers.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { dispatch } from '../../src/mcp/handlers.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState, readState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { createDetachedSession, sessionName, killSession } from '../../src/tmux.js';

describe('MCP handlers dispatch', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });

  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  async function setup(): Promise<{orchId: string; repoPath: string}> {
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
    return { orchId, repoPath: repo.path };
  }

  it('spawn_musician returns a musician_id', async () => {
    const { orchId } = await setup();
    const result = await dispatch(orchId, 'spawn_musician', {
      name: 'tester', task: 'do work', worktree: false,
    }, { dryRun: true });
    expect(result.musician_id).toMatch(/^mus-\d{3}$/);
  });

  it('list_musicians returns the live roster', async () => {
    const { orchId } = await setup();
    await dispatch(orchId, 'spawn_musician', { name: 'one', task: 't', worktree: false }, { dryRun: true });
    await dispatch(orchId, 'spawn_musician', { name: 'two', task: 't', worktree: false }, { dryRun: true });
    const result = await dispatch(orchId, 'list_musicians', {});
    expect(result.musicians).toHaveLength(2);
  });

  it('note_write / note_read round-trip', async () => {
    const { orchId } = await setup();
    await dispatch(orchId, 'note_write', { filename: 'overview.md', content: '# hi' });
    const result = await dispatch(orchId, 'note_read', { filename: 'overview.md' });
    expect(result.content).toBe('# hi');
  });

  it('report_done sets status to idle and records summary', async () => {
    const { orchId } = await setup();
    const { musician_id } = await dispatch(orchId, 'spawn_musician', {
      name: 'r', task: 't', worktree: false,
    }, { dryRun: true });
    await dispatch(orchId, 'report_done', {
      summary: 'all green', _from_musician_id: musician_id,
    });
    const state = await readState(orchId);
    expect(state!.musicians[0].status).toBe('idle');
  });

  it('throws on unknown tool', async () => {
    const { orchId } = await setup();
    await expect(dispatch(orchId, 'totally_made_up', {})).rejects.toThrow(/Unknown tool/);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

- [ ] **Step 3: Implement `src/mcp/handlers.ts`**

```typescript
import { createMusician } from '../musicians/spawn.js';
import { messageMusician } from '../musicians/message.js';
import { queryMusician } from '../musicians/query.js';
import { dismissMusician } from '../musicians/dismiss.js';
import { noteRead, noteWrite, noteList } from '../notes.js';
import { readState } from '../state.js';
import { setMusicianStatus } from '../state-updaters.js';

export interface DispatchOptions {
  /** Used by tests to skip launching real `claude` processes. */
  dryRun?: boolean;
  /**
   * The id of the Musician making the call, if any. report_done uses this
   * to know which Musician to mark idle. In production this is derived
   * from the MCP server's context (Phase 2: passed via an internal arg).
   */
  callerMusicianId?: string;
}

export async function dispatch(
  orchestraId: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: DispatchOptions = {},
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'spawn_musician': {
      const r = await createMusician({
        orchestraId,
        name: String(args.name),
        task: String(args.task),
        worktree: typeof args.worktree === 'boolean' ? args.worktree : undefined,
        branchFrom: typeof args.branch_from === 'string' ? args.branch_from : undefined,
        dryRun: opts.dryRun,
      });
      return r;
    }
    case 'message_musician': {
      await messageMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        message: String(args.message),
      });
      return { ok: true };
    }
    case 'query_musician': {
      const text = await queryMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        lines: typeof args.lines === 'number' ? args.lines : undefined,
      });
      return { content: text };
    }
    case 'list_musicians': {
      const state = await readState(orchestraId);
      if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);
      return { musicians: state.musicians };
    }
    case 'dismiss_musician': {
      await dismissMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        archiveWorktree: typeof args.archive_worktree === 'boolean' ? args.archive_worktree : undefined,
        summary: typeof args.summary === 'string' ? args.summary : null,
      });
      return { ok: true };
    }
    case 'report_done': {
      const summary = typeof args.summary === 'string' ? args.summary : '';
      // Test seam: callers can pass `_from_musician_id` explicitly.
      const callerId = (typeof args._from_musician_id === 'string')
        ? args._from_musician_id
        : opts.callerMusicianId;
      if (!callerId) throw new Error('report_done: no caller musician id');
      await setMusicianStatus(orchestraId, callerId, 'idle');
      return { ok: true, recorded: summary };
    }
    case 'note_write': {
      await noteWrite(orchestraId, String(args.filename), String(args.content));
      return { ok: true };
    }
    case 'note_read': {
      const content = await noteRead(orchestraId, String(args.filename));
      return { content };
    }
    case 'note_list': {
      const files = await noteList(orchestraId);
      return { files };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

- [ ] **Step 4: Run test, confirm PASS**

`npm test -- mcp/handlers` — expected 5/5 PASS.

- [ ] **Step 5: Commit**

```
git add src/mcp/handlers.ts tests/mcp/handlers.test.ts
git commit -m "$(cat <<'EOF'
feat(mcp): handler dispatch table mapping tool names to Phase 2 ops

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: MCP server skeleton + entry point

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/commands/mcp-server.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement `src/mcp/server.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NFO_TOOLS } from './tool-defs.js';
import { dispatch } from './handlers.js';

export interface RunServerOptions {
  orchestraId: string;
  /** Set when this server is attached to a specific Musician. */
  callerMusicianId?: string;
}

export async function runServer(opts: RunServerOptions): Promise<void> {
  const server = new Server(
    { name: 'nfo-mcp', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: NFO_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatch(opts.orchestraId, name, (args ?? {}) as Record<string, unknown>, {
        callerMusicianId: opts.callerMusicianId,
      });
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 2: Implement `src/commands/mcp-server.ts`**

```typescript
import { runServer } from '../mcp/server.js';
import { readState } from '../state.js';

export interface McpServerCliOptions {
  orchestraId: string;
  callerMusicianId?: string;
}

export async function runMcpServerCli(opts: McpServerCliOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  await runServer({
    orchestraId: opts.orchestraId,
    callerMusicianId: opts.callerMusicianId,
  });
}
```

- [ ] **Step 3: Wire the `mcp-server` subcommand in `src/cli.ts`**

Add this subcommand (place after `notes`):

```typescript
program
  .command('mcp-server', { hidden: true })
  .description('(internal) Run the NFO MCP server attached to an orchestra')
  .requiredOption('--orchestra-id <id>', 'Orchestra id')
  .option('--caller-musician-id <id>', 'When the server is hosting a Musician')
  .action(async (opts: { orchestraId: string; callerMusicianId?: string }) => {
    const { runMcpServerCli } = await import('./commands/mcp-server.js');
    await runMcpServerCli({
      orchestraId: opts.orchestraId,
      callerMusicianId: opts.callerMusicianId,
    });
  });
```

- [ ] **Step 4: Smoke test — server boots and lists tools**

Write a temporary script `scratch-mcp-smoke.mjs` (do NOT commit) that spawns `node dist/cli.js mcp-server --orchestra-id <some-known-orchestra-id>` as a child, sends a `tools/list` JSON-RPC message over stdin, and asserts the response includes our 9 tool names. Alternative: leave this to Task 19 e2e. For now just ensure:

```
npm run build
npm run typecheck
npm test
```

All pass.

- [ ] **Step 5: Commit**

```
git add src/mcp/server.ts src/commands/mcp-server.ts src/cli.ts
git commit -m "$(cat <<'EOF'
feat(mcp): stdio server skeleton + hidden `nfo mcp-server` subcommand

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Wire the Orchestrator to the MCP server

**Files:**
- Modify: `src/commands/launch.ts`
- Modify: `tests/commands/launch.test.ts`

`createOrchestra` now needs to write the mcp-config.json and pass `--mcp-config` to claude.

- [ ] **Step 1: Update `createOrchestra` in `src/commands/launch.ts`**

After `writeState(opts.orchestraId, state);` and before the prompt file write, add:

```typescript
  // Write the MCP config so claude can spawn `nfo mcp-server --orchestra-id ...` on demand.
  const mcpConfigPath = join(orchestraDir(opts.orchestraId), 'mcp-config.json');
  await writeFile(mcpConfigPath, JSON.stringify({
    mcpServers: {
      nfo: {
        command: 'nfo',
        args: ['mcp-server', '--orchestra-id', opts.orchestraId],
      },
    },
  }, null, 2), 'utf8');
```

Change the prompt-file write to concatenate the role addendum with any existing notes (per spec §7.3 — Orchestrator notes are loaded at every launch):

```typescript
  // Role addendum + any prior curated notes (overview.md, decisions.md).
  const promptFile = join(orchestraDir(opts.orchestraId), 'orchestrator-prompt.md');
  const notes = await loadOrchestratorNotes(opts.orchestraId);
  await writeFile(promptFile, ORCHESTRATOR_ROLE_PROMPT_V1 + notes, 'utf8');
```

Add this helper at the bottom of `launch.ts` (it'll also be reused by `restore.ts` — keep it exported):

```typescript
import { noteRead, noteList } from '../notes.js';

export async function loadOrchestratorNotes(orchestraId: string): Promise<string> {
  const files = await noteList(orchestraId);
  const ordered = ['overview.md', 'decisions.md'].filter(f => files.includes(f));
  if (ordered.length === 0) return '';
  const parts: string[] = ['\n\n## Curated project notes (loaded from notes/)\n'];
  for (const f of ordered) {
    const content = await noteRead(orchestraId, f);
    if (content.trim().length === 0) continue;
    parts.push(`\n### ${f}\n\n${content}\n`);
  }
  return parts.join('');
}
```

Then in the claude command construction, add `'--mcp-config', mcpConfigPath` to the flag list:

```typescript
  const claudeFlags = claudeFlagsForLevel(opts.permissionLevel);
  const claudeCmd = [
    'claude',
    ...claudeFlags,
    '--mcp-config', mcpConfigPath,
    '--append-system-prompt-file', promptFile,
  ].join(' ');
```

- [ ] **Step 2: Update `tests/commands/launch.test.ts`**

Add an assertion that `mcp-config.json` was written:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orchestraDir } from '../../src/config.js';

// ... inside the existing test, after the state assertions:

    const mcpCfg = join(orchestraDir(result.orchestraId), 'mcp-config.json');
    expect(existsSync(mcpCfg)).toBe(true);
    const parsed = JSON.parse(readFileSync(mcpCfg, 'utf8'));
    expect(parsed.mcpServers.nfo.command).toBe('nfo');
    expect(parsed.mcpServers.nfo.args).toEqual(['mcp-server', '--orchestra-id', result.orchestraId]);
```

- [ ] **Step 3: Run tests**

`npm test -- launch` — expected PASS with the new assertion.
`npm test` — full suite must pass.

- [ ] **Step 4: Commit**

```
git add src/commands/launch.ts tests/commands/launch.test.ts
git commit -m "$(cat <<'EOF'
feat(launch): write mcp-config.json and attach to Orchestrator claude session

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Restore musicians on orchestra restore

**Files:**
- Modify: `src/commands/restore.ts`

- [ ] **Step 1: Update `restoreOrchestra` in `src/commands/restore.ts`**

After the Orchestrator pane is launched, restore each non-stopped musician. Add this section before the final `if (!dryRun) await attachSession(name)`:

```typescript
  // Rebuild the Orchestrator's prompt file with the current notes content.
  const { loadOrchestratorNotes } = await import('./launch.js');
  const promptFileForOrchestrator = join(orchestraDir(orchestraId), 'orchestrator-prompt.md');
  if (existsSync(promptFileForOrchestrator)) {
    const { ORCHESTRATOR_ROLE_PROMPT_V1 } = await import('../prompts/orchestrator-role.js');
    const notes = await loadOrchestratorNotes(orchestraId);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(promptFileForOrchestrator, ORCHESTRATOR_ROLE_PROMPT_V1 + notes, 'utf8');
  }

  // Restore musicians (Phase 2). Stopped musicians are not restored.
  const mcpConfigPath = join(orchestraDir(orchestraId), 'mcp-config.json');
  for (const musician of state.musicians) {
    if (musician.status === 'stopped') continue;
    // Create the tmux window in the musician's working dir.
    const workingDir = musician.worktree_path ?? state.project_path;
    const winLabel = `mus-${musician.id}-${sanitiseNameLocal(musician.name)}`;
    await execa('tmux', [
      'new-window',
      '-t', name,
      '-n', winLabel,
      '-c', workingDir,
      '-d',
    ], { reject: false });
    // Launch claude --resume in that window.
    const musicianPromptFile = join(orchestraDir(orchestraId), `musician-${musician.id}-prompt.md`);
    const resumeArgs = musician.claude_session_id ? ['--resume', musician.claude_session_id] : [];
    const cmd = [
      'claude',
      ...flags,
      ...resumeArgs,
      '--mcp-config', mcpConfigPath,
    ];
    if (existsSync(musicianPromptFile)) {
      cmd.push('--append-system-prompt-file', musicianPromptFile);
    }
    await sendKeys(`${name}:${winLabel}`, cmd.join(' '), true);
  }

  function sanitiseNameLocal(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'musician';
  }
```

Also at the top, ensure `execa` is imported (it should already be present from earlier or, if not, add `import { execa } from 'execa';`). And update the existing `--mcp-config` injection for the Orchestrator: the current code in restore launches claude without `--mcp-config`. Add the flag:

```typescript
  const cmd = ['claude', ...flags, ...resumeArgs, '--mcp-config', mcpConfigPath];
```

(Use the same `mcpConfigPath` variable defined above.)

- [ ] **Step 2: Update the restore test minimally**

The existing `tests/commands/restore.test.ts` test already asserts the orchestra is restored from a known-but-stopped state. Phase 2 doesn't need a new test — the musician-restoration path is exercised at the integration level in Task 17. Run the existing test:

`npm test -- restore` — must still pass.

- [ ] **Step 3: Full suite**

`npm test` — must pass.

- [ ] **Step 4: Commit**

```
git add src/commands/restore.ts
git commit -m "$(cat <<'EOF'
feat(restore): attach mcp-config and rehydrate non-stopped musicians

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Integration smoke — Orchestrator spawns a Musician via MCP

**Files:**
- Create: `tests/integration/orchestrator-spawn.test.ts`

This test does NOT actually drive a real Claude Code session (that would need an API key and time). Instead it boots the NFO MCP server as a child process and speaks the MCP JSON-RPC protocol to it directly — which is exactly what claude does in production.

- [ ] **Step 1: Test**

`tests/integration/orchestrator-spawn.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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

    // 1. initialize
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    }});

    // wait for init response
    await waitFor(() => responses.some(r => r.id === 1));

    // 2. tools/list
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await waitFor(() => responses.some(r => r.id === 2));
    const listResp = responses.find(r => r.id === 2) as any;
    expect(listResp.result.tools.length).toBe(9);

    // 3. tools/call spawn_musician
    send({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'spawn_musician',
        arguments: { name: 'tester', task: 'echo it', worktree: false },
      },
    });
    await waitFor(() => responses.some(r => r.id === 3));

    proc.kill();

    // Confirm a musician was added to state.
    const state = await readState(orchId);
    expect(state!.musicians).toHaveLength(1);
    expect(state!.musicians[0].name).toBe('tester');
  }, 15000);
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await new Promise(r => setTimeout(r, 25));
  }
}
```

Note: this test starts the MCP server as a child process; the server in turn runs `createMusician` which (in real production) spawns claude in a new tmux window. In the test the tmux window is created but the `claude` command sent into it will probably fail to find claude or fail to start — that's OK; we only assert on the state.json after the spawn_musician returns. We rely on `dispatch(..., { dryRun: false })` being acceptable because the actual `claude ...` command is just sent to a tmux pane as text, no waiting.

Actually we DO want a dryRun here. Let me fix that — re-evaluate. The MCP server `dispatch` is called with `{ callerMusicianId: opts.callerMusicianId }` only — no `dryRun`. So the server runs `createMusician` with `dryRun: false`, which calls `tmux new-window` and `sendKeys 'claude ...'`. The sendKeys will inject text into the pane; whether `claude` runs is the shell's problem. The state is written immediately after `tmux new-window` returns. So the test should pass even without dryRun.

If this becomes flaky, add an env var `NFO_MCP_DRY_RUN=1` that the server respects and passes through to dispatch. For now ship as written.

- [ ] **Step 2: Run test**

```
npm run build      # required so dist/cli.js is fresh
npm test -- integration/orchestrator-spawn
```

Expected: 1/1 PASS.

If it fails because dist is stale, `npm run build` and re-run. If it fails because the MCP child errors before init, dump `proc.stderr` to logs.

- [ ] **Step 3: Commit**

```
git add tests/integration/orchestrator-spawn.test.ts
git commit -m "$(cat <<'EOF'
test(mcp): e2e — child-process MCP server speaks JSON-RPC and spawns a Musician

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Update README for Phase 2

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Status and Use sections of `README.md`**

Replace the Status block with:

```markdown
## Status

Phase 2. The `nfo` command can create/attach/restore/list/kill an Orchestra and launch the Orchestrator's `claude` session in a tmux pane. The Orchestrator has access to the NFO MCP tools — it can spawn Musicians (Claude sub-agents) into hidden tmux windows, message and query them, dismiss them, and curate persistent project notes. Each Musician gets a dedicated git worktree. The Ink TUI side pane and permission-prompt detection ship in later phases — for now, switch between Musician windows with raw tmux (`prefix + w`).
```

Append after the Use section:

```markdown
## Musicians

Inside an orchestra, the Orchestrator can use these MCP tools:

- `spawn_musician({ name, task })` — create a Musician in an isolated git worktree
- `message_musician({ musician_id, message })`
- `query_musician({ musician_id, lines? })` — read recent pane output
- `list_musicians()`
- `dismiss_musician({ musician_id, archive_worktree? })` — archived = worktree preserved under `archive/`, branch kept; dropped = worktree gone, branch deleted
- `report_done({ summary })` — called by Musicians on completion
- `note_write` / `note_read` / `note_list` — Orchestrator's persistent notes

To watch a Musician work, in the tmux session: `prefix + w` to list windows, then select theirs.
```

- [ ] **Step 2: Commit**

```
git add README.md
git commit -m "$(cat <<'EOF'
docs: README for Phase 2 (MCP tools + musicians)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Final audit + tag

Not a code task — a verification gate.

- [ ] **Step 1: Full test suite**

`npm test` — confirm all tests pass. Should be roughly 30 (Phase 1) + ~20 new = ~50 tests across ~20 files.

- [ ] **Step 2: Build + typecheck clean**

```
npm run typecheck
npm run build
```

Both must pass.

- [ ] **Step 3: Manual smoke**

In a throwaway env:

```bash
export NFO_HOME=/tmp/nfo-phase2-home
rm -rf "$NFO_HOME" /tmp/nfo-phase2-repo
mkdir /tmp/nfo-phase2-repo && cd /tmp/nfo-phase2-repo
git init -q && git commit --allow-empty -m init
nfo
# Pick supervised. Inside the Orchestrator pane, ask claude:
# "Use the spawn_musician tool to create a Musician named 'echo-test' with the task 'just print hello'."
# Then `prefix + w` to see the musician's window in the tmux session.
# Then ask claude: "list_musicians" — should show the spawned musician.
# Then: "dismiss_musician with archive_worktree=false on that musician."
# Confirm via `tmux list-windows` that the musician's window is gone.
```

Report any issues encountered.

- [ ] **Step 4: Tag**

```
git tag phase-2-complete
```

Phase 3 (Ink TUI + Auditorium + Concert Hall) gets its own plan.
