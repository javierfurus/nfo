# NFO Phase 3 — Ink TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 placeholder right pane with a real Ink TUI: a **Concert Hall** (tabs for every known orchestra with status), an **Auditorium** (live musician roster with status indicators and a one-line activity hint), and a **status bar** (permission level, token hint, key hints). Keyboard navigation lets the user jump into a Musician's tmux window, cycle orchestras, open notes, dismiss a musician, and return to the Orchestrator pane.

**Architecture:** A single Ink (React-for-terminals) app launched as `nfo tui --orchestra-id <id>` in the right tmux pane. The app is split into pure, testable units (a relative-time formatter, status-icon mapper, activity-line extractor, a keyboard reducer) and thin presentational React components fed by two polling loops: a **state watcher** (chokidar on `state.json` + 1 s poll fallback) and an **activity poller** (every 2 s, `tmux capture-pane` per musician). The container component wires hooks → a pure `reduceKey` reducer → side effects (tmux window/pane selection, notes, dismiss). All side-effecting modules already exist from Phases 1–2; Phase 3 only adds the view layer and the polling glue.

**Tech Stack:** `ink@^7`, `react@^19`, `react-dom@^19` (peer of react), `ink-testing-library` (for component tests), `chokidar@^5` (state file watching). TypeScript with `jsx: react-jsx`. Vitest with esbuild automatic JSX.

**Component return type (applies to every `.tsx` component):** annotate components with `ReactElement` from React, NOT the global `JSX.Element` (React 19 moved the JSX namespace and the global `JSX.Element` may not resolve). Add `import type { ReactElement } from 'react';` and write `export function Foo(props: FooProps): ReactElement { ... }`. The code samples below show `JSX.Element` for brevity — substitute `ReactElement` when transcribing. If a build genuinely accepts `JSX.Element`, that is also fine, but prefer `ReactElement` for robustness.

**Reference spec:** `docs/specs/2026-05-29-nfo-design.md` §8 (TUI design — layout, sections, keybindings, update mechanism), plus §5.2.1 status enum (`awaiting_permission` is rendered but Phase 4 populates it), §3.3 (TUI is a non-load-bearing viewer).

**MANDATORY code style (applies to every task):**
- Control flow uses explicit braced multi-line blocks. Never the brace-less single-line form (`if (c) { return x; }`, never `if (c) return x;`). Same for `for`/`while`/`else`/`switch`.
- Arrow functions use explicit `{ return ... }` bodies, never implicit-return expression bodies — EXCEPT React component definitions returning JSX, which use `(props) => { return (<JSX/>); }` (still an explicit braced return). Array callbacks: `.map((m) => { return <Row .../>; })`, never `.map(m => <Row/>)`.
- Ternaries (`a ? b : c`) ARE allowed, including inside JSX (`{cond ? <A/> : <B/>}`).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Local git identity (Javier Furus <javierfurus@gmail.com>) is already configured — do not change it. Use the HEREDOC commit form.
- Every code task runs `npm run build` (tsc) AND `npm test` before commit — `npm test` already has a `pretest: tsc` hook, but run build explicitly too when iterating.

**Explicitly NOT in Phase 3 (must not creep in):**
- Permission-prompt detection / populating `awaiting_permission` (Phase 4). The TUI must RENDER that status if present, but nothing sets it yet.
- Mouse click handling beyond what Ink gives for free (keyboard nav is the contract).
- Bell / desktop notifications (Phase 4).
- Real token/cost computation — the status bar shows a placeholder/`—` (Phase 3 does not parse claude's token line).
- A `?` help overlay (deferred to Phase 4). Do NOT advertise `[?] help` in the status bar since no handler exists.
- Concert Hall orchestra-switching (Tab/Shift-Tab actually attaching a different session). The reducer emits the actions and the Concert Hall renders all orchestras, but switching is a no-op in Phase 3.
- Any change to the MCP server, musician primitives, or state schema.

---

## File Structure

```
package.json                    # MODIFY: add ink/react/react-dom/chokidar + @types/react + ink-testing-library
tsconfig.json                   # MODIFY: add "jsx": "react-jsx"
vitest.config.ts                # MODIFY: esbuild jsx automatic
src/
├── tui/
│   ├── format-time.ts          # NEW: formatRelativeTime(iso, now) → "2m", "<1s", "3h"
│   ├── status-icon.ts          # NEW: statusIcon(status) / statusLabel(status)
│   ├── activity-line.ts        # NEW: extractActivityLine(paneText) → last meaningful line
│   ├── keymap.ts               # NEW: reduceKey(ui, input, key) pure reducer → {ui, action?}
│   ├── poll-activity.ts        # NEW: pollActivity(state) → Record<musicianId, string>
│   ├── watch-state.ts          # NEW: watchOrchestraState(id, onChange) → stop()
│   ├── StatusBar.tsx           # NEW: presentational
│   ├── Auditorium.tsx          # NEW: presentational
│   ├── ConcertHall.tsx         # NEW: presentational
│   ├── AppView.tsx             # NEW: presentational composition (props → full UI)
│   └── App.tsx                 # NEW: container (hooks + useInput → reduceKey → effects)
├── commands/
│   ├── tui.ts                  # NEW: runTui({orchestraId}) — renders <App/>
│   ├── launch.ts               # MODIFY: right pane runs `nfo tui` not placeholder
│   └── restore.ts              # MODIFY: right pane runs `nfo tui` not placeholder
├── tmux.ts                     # MODIFY: add selectWindow + selectPane
└── cli.ts                      # MODIFY: register `tui` subcommand (hidden)
tests/
├── tui/
│   ├── format-time.test.ts
│   ├── status-icon.test.ts
│   ├── activity-line.test.ts
│   ├── keymap.test.ts
│   ├── poll-activity.test.ts
│   ├── watch-state.test.ts
│   ├── StatusBar.test.tsx
│   ├── Auditorium.test.tsx
│   ├── ConcertHall.test.tsx
│   └── AppView.test.tsx
└── tmux.test.ts                # MODIFY: add selectWindow/selectPane cases
```

---

## Task 1: Dependencies + JSX config

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1: Add dependencies**

Add to `package.json` `dependencies` (alphabetical): `"chokidar": "^5.0.0"`, `"ink": "^7.0.0"`, `"react": "^19.0.0"`, `"react-dom": "^19.0.0"`.
Add to `devDependencies`: `"@types/react": "^19.0.0"`, `"ink-testing-library": "^4.0.0"`.

- [ ] **Step 2: Install and resolve peer conflicts**

Run: `npm install`.

COMPATIBILITY RISK: `ink-testing-library@4` may declare a peer range that excludes `ink@7`. If `npm install` fails with a peer-dep error (or `ink-testing-library`'s render is incompatible at runtime in Step 5), resolve by aligning versions to a known-good combination. Preferred order:
1. Try `ink@^7` + `ink-testing-library@^4` first.
2. If incompatible, pin `ink` down to the highest major that `ink-testing-library@4` supports (check `npm view ink-testing-library@4 peerDependencies`), e.g. `ink@^5`. Our component code only uses `Box`, `Text`, `render`, `useInput`, `useApp` — stable across ink 5/6/7 — so downgrading ink is safe.
Report the EXACT final versions installed.

- [ ] **Step 3: Enable JSX in `tsconfig.json`**

Add `"jsx": "react-jsx"` to `compilerOptions`. (With `react-jsx` you do NOT need `import React` in every file.)

- [ ] **Step 4: Enable JSX in vitest**

Edit `vitest.config.ts` to add an `esbuild` block so `.tsx` files transform with the automatic JSX runtime:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 10000,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
```

(Note the `include` now also matches `.test.tsx`.)

- [ ] **Step 5: Smoke-render an Ink component to prove the toolchain works**

Create a throwaway check (do NOT commit it). Make `tests/tui/_smoke.test.tsx` temporarily:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

describe('ink toolchain smoke', () => {
  it('renders text', () => {
    const { lastFrame } = render(<Text>hello-ink</Text>);
    expect(lastFrame()).toContain('hello-ink');
  });
});
```

Run: `npm test -- tui/_smoke`. Confirm PASS. Then DELETE `tests/tui/_smoke.test.tsx` (it was only to prove the toolchain).

- [ ] **Step 6: Verify full build + suite**

```
npm run build
npm test
```
Build must pass (tsc compiles .tsx). Full suite still 59/59 (the deleted smoke test leaves no trace).

- [ ] **Step 7: Commit**

```
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "$(cat <<'EOF'
chore: add ink/react/chokidar deps and enable JSX (tsc + vitest)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Relative-time formatter

**Files:** `tests/tui/format-time.test.ts`, `src/tui/format-time.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/tui/format-time.js';

const NOW = '2026-05-29T12:00:00Z';

describe('formatRelativeTime', () => {
  it('shows <1s for sub-second deltas', () => {
    expect(formatRelativeTime('2026-05-29T11:59:59.500Z', NOW)).toBe('<1s');
  });
  it('shows seconds', () => {
    expect(formatRelativeTime('2026-05-29T11:59:52Z', NOW)).toBe('8s');
  });
  it('shows minutes', () => {
    expect(formatRelativeTime('2026-05-29T11:58:00Z', NOW)).toBe('2m');
  });
  it('shows hours', () => {
    expect(formatRelativeTime('2026-05-29T09:00:00Z', NOW)).toBe('3h');
  });
  it('shows days', () => {
    expect(formatRelativeTime('2026-05-27T12:00:00Z', NOW)).toBe('2d');
  });
  it('returns ? for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('?');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npm test -- format-time`.

- [ ] **Step 3: Implement `src/tui/format-time.ts`**

```typescript
export function formatRelativeTime(iso: string, nowIso: string): string {
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) {
    return '?';
  }
  const deltaMs = now - then;
  if (deltaMs < 1000) {
    return '<1s';
  }
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
```

- [ ] **Step 4: Run, confirm PASS** (6/6).

- [ ] **Step 5: Commit**

```
git add src/tui/format-time.ts tests/tui/format-time.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): relative-time formatter for the Auditorium

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Status icon + label

**Files:** `tests/tui/status-icon.test.ts`, `src/tui/status-icon.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { statusIcon, statusColor } from '../../src/tui/status-icon.js';
import type { MusicianStatus } from '../../src/state.types.js';

describe('statusIcon', () => {
  it('maps each status to an icon', () => {
    expect(statusIcon('working')).toBe('●');
    expect(statusIcon('idle')).toBe('◐');
    expect(statusIcon('awaiting_permission')).toBe('⚠');
    expect(statusIcon('stopped')).toBe('○');
  });
});

describe('statusColor', () => {
  it('maps each status to an ink color name', () => {
    const colors: Record<MusicianStatus, string> = {
      working: statusColor('working'),
      idle: statusColor('idle'),
      awaiting_permission: statusColor('awaiting_permission'),
      stopped: statusColor('stopped'),
    };
    expect(colors.working).toBe('green');
    expect(colors.idle).toBe('yellow');
    expect(colors.awaiting_permission).toBe('red');
    expect(colors.stopped).toBe('gray');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `src/tui/status-icon.ts`**

```typescript
import type { MusicianStatus } from '../state.types.js';

export function statusIcon(status: MusicianStatus): string {
  switch (status) {
    case 'working': {
      return '●';
    }
    case 'idle': {
      return '◐';
    }
    case 'awaiting_permission': {
      return '⚠';
    }
    case 'stopped': {
      return '○';
    }
  }
}

export function statusColor(status: MusicianStatus): string {
  switch (status) {
    case 'working': {
      return 'green';
    }
    case 'idle': {
      return 'yellow';
    }
    case 'awaiting_permission': {
      return 'red';
    }
    case 'stopped': {
      return 'gray';
    }
  }
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```
git add src/tui/status-icon.ts tests/tui/status-icon.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): musician status icon + color mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Activity-line extractor

**Files:** `tests/tui/activity-line.test.ts`, `src/tui/activity-line.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { extractActivityLine } from '../../src/tui/activity-line.js';

describe('extractActivityLine', () => {
  it('returns the last non-empty trimmed line', () => {
    const pane = 'first line\nsecond line\n\n   \nthird line\n\n';
    expect(extractActivityLine(pane)).toBe('third line');
  });
  it('returns empty string for all-blank input', () => {
    expect(extractActivityLine('\n  \n\t\n')).toBe('');
  });
  it('truncates very long lines to 60 chars with an ellipsis', () => {
    const long = 'x'.repeat(100);
    const out = extractActivityLine(long);
    expect(out.length).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });
  it('handles empty string', () => {
    expect(extractActivityLine('')).toBe('');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `src/tui/activity-line.ts`**

```typescript
const MAX_LEN = 60;

export function extractActivityLine(paneText: string): string {
  const lines = paneText.split('\n');
  let last = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      last = trimmed;
    }
  }
  if (last.length > MAX_LEN) {
    return last.slice(0, MAX_LEN - 1) + '…';
  }
  return last;
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```
git add src/tui/activity-line.ts tests/tui/activity-line.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): extract last meaningful line from a captured pane

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: tmux selectWindow + selectPane

**Files:** `src/tmux.ts` (MODIFY), `tests/tmux.test.ts` (MODIFY)

- [ ] **Step 1: Add the failing tests to `tests/tmux.test.ts`**

Add these imports to the existing import block at the top: `selectWindow`, `selectPane`. Then add inside the existing `describe('tmux wrapper', ...)`:

```typescript
  it('selectWindow makes a window active', async () => {
    const name = `nfo-test-selwin-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    const { execa } = await import('execa');
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', name, '-n', 'second', '-c', '/tmp', '-d',
      '-P', '-F', '#{window_id}',
    ]);
    await selectWindow(name, winId.trim());
    const { stdout: active } = await execa('tmux', [
      'display-message', '-p', '-t', name, '#{window_id}',
    ]);
    expect(active.trim()).toBe(winId.trim());
  });

  it('selectPane makes a pane active', async () => {
    const name = `nfo-test-selpane-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    // split so there are two panes (0.0 and 0.1)
    const { execa } = await import('execa');
    await execa('tmux', ['split-window', '-h', '-t', `${name}:0`, '-c', '/tmp']);
    await selectPane(`${name}:0.0`);
    const { stdout: active } = await execa('tmux', [
      'display-message', '-p', '-t', name, '#{pane_index}',
    ]);
    expect(active.trim()).toBe('0');
  });
```

- [ ] **Step 2: Run, confirm FAIL** — `npm test -- tmux` (the two new tests fail / functions missing).

- [ ] **Step 3: Add to `src/tmux.ts`**

```typescript
export async function selectWindow(name: string, windowTarget: string): Promise<void> {
  await execa('tmux', ['select-window', '-t', `${name}:${windowTarget}`]);
}

export async function selectPane(target: string): Promise<void> {
  await execa('tmux', ['select-pane', '-t', target]);
}
```

- [ ] **Step 4: Run, confirm PASS** (all tmux tests, including the 2 new).

- [ ] **Step 5: Commit**

```
git add src/tmux.ts tests/tmux.test.ts
git commit -m "$(cat <<'EOF'
feat(tmux): selectWindow + selectPane for TUI navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Activity poller service

**Files:** `tests/tui/poll-activity.test.ts`, `src/tui/poll-activity.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { pollActivity } from '../../src/tui/poll-activity.js';
import { makeTmpRepo, type TmpRepo } from '../helpers/tmp-repo.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { projectKeyFromPath } from '../../src/project-key.js';
import { addMusician } from '../../src/state-updaters.js';
import { createDetachedSession, sessionName, killSession, sendKeys } from '../../src/tmux.js';
import { readState } from '../../src/state.js';
import { execa } from 'execa';

describe('pollActivity', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const sessionsToKill: string[] = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('returns the last activity line per active musician', async () => {
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
      'new-window', '-t', sess, '-n', 'mus-001-x', '-c', repo.path, '-d',
      '-P', '-F', '#{window_id}',
    ]);
    await addMusician(orchId, {
      id: 'mus-001', name: 'x', task_summary: 't', status: 'working',
      tmux_window_id: winId.trim(), claude_session_id: null,
      worktree_path: null, branch: null,
      spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
    });
    await sendKeys(`${sess}:${winId.trim()}`, 'echo nfo-activity-xyz', true);
    await new Promise((r) => { setTimeout(r, 250); });

    const state = await readState(orchId);
    const activity = await pollActivity(state!);
    expect(activity['mus-001']).toContain('nfo-activity-xyz');
  });

  it('skips stopped musicians', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    const repo: TmpRepo = await makeTmpRepo();
    cleanups.push(repo.cleanup);
    const orchId = projectKeyFromPath(repo.path);
    await ensureOrchestraDir(orchId);
    const initial = makeInitialState({
      orchestraId: orchId, projectPath: repo.path, permissionLevel: 'supervised',
    });
    initial.musicians.push({
      id: 'mus-001', name: 'x', task_summary: 't', status: 'stopped',
      tmux_window_id: '@gone', claude_session_id: null,
      worktree_path: null, branch: null,
      spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
    });
    await writeState(orchId, initial);
    const state = await readState(orchId);
    const activity = await pollActivity(state!);
    expect(activity['mus-001']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `src/tui/poll-activity.ts`**

```typescript
import { capturePane, sessionName } from '../tmux.js';
import { extractActivityLine } from './activity-line.js';
import type { OrchestraState } from '../state.types.js';

/**
 * For each non-stopped musician, capture the last lines of its tmux window
 * and reduce to a single activity hint. Failures (e.g. a window that no longer
 * exists) are swallowed per-musician so one dead pane never breaks the poll.
 */
export async function pollActivity(state: OrchestraState): Promise<Record<string, string>> {
  const session = sessionName(state.orchestra_id);
  const result: Record<string, string> = {};
  for (const musician of state.musicians) {
    if (musician.status === 'stopped') {
      continue;
    }
    try {
      const pane = await capturePane(`${session}:${musician.tmux_window_id}`, 10);
      result[musician.id] = extractActivityLine(pane);
    } catch {
      result[musician.id] = '';
    }
  }
  return result;
}
```

- [ ] **Step 4: Run, confirm PASS** (2/2).

- [ ] **Step 5: Commit**

```
git add src/tui/poll-activity.ts tests/tui/poll-activity.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): activity poller — capture-pane per musician into a hint map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: State watcher

**Files:** `tests/tui/watch-state.test.ts`, `src/tui/watch-state.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { watchOrchestraState } from '../../src/tui/watch-state.js';
import { makeTmpConfig } from '../helpers/tmp-config.js';
import { ensureOrchestraDir, writeState } from '../../src/state.js';
import { makeInitialState } from '../../src/state.types.js';
import { setOrchestratorSessionId } from '../../src/state-updaters.js';
import type { OrchestraState } from '../../src/state.types.js';

describe('watchOrchestraState', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const stops: Array<() => Promise<void>> = [];

  beforeEach(() => { process.env.NFO_HOME = ''; });
  afterEach(async () => {
    for (const stop of stops) { await stop(); }
    stops.length = 0;
    for (const c of cleanups) { await c(); }
    cleanups.length = 0;
    delete process.env.NFO_HOME;
  });

  it('emits the current state immediately and again on change', async () => {
    const cfg = await makeTmpConfig();
    cleanups.push(cfg.cleanup);
    process.env.NFO_HOME = cfg.path;
    await ensureOrchestraDir('orch-w');
    await writeState('orch-w', makeInitialState({
      orchestraId: 'orch-w', projectPath: '/tmp/x', permissionLevel: 'supervised',
    }));

    const seen: OrchestraState[] = [];
    const stop = await watchOrchestraState('orch-w', (s) => { seen.push(s); });
    stops.push(stop);

    // initial emit
    await waitFor(() => { return seen.length >= 1; });
    expect(seen[0].orchestra_id).toBe('orch-w');

    // mutate → expect another emit
    await setOrchestratorSessionId('orch-w', 'sess-123');
    await waitFor(() => { return seen.some((s) => { return s.orchestrator_session_id === 'sess-123'; }); }, 4000);
    expect(seen.some((s) => { return s.orchestrator_session_id === 'sess-123'; })).toBe(true);
  });
});

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out');
    }
    await new Promise((r) => { setTimeout(r, 25); });
  }
}
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `src/tui/watch-state.ts`**

```typescript
import chokidar from 'chokidar';
import { stateFile } from '../config.js';
import { readState } from '../state.js';
import type { OrchestraState } from '../state.types.js';

export type StopWatching = () => Promise<void>;

/**
 * Watch an orchestra's state.json and invoke `onChange` with the parsed state:
 * once immediately, then on every file change. A chokidar watcher handles the
 * common case; a 1s poll fallback covers filesystems without reliable inotify.
 * Reads that fail mid-write (partial JSON) are swallowed — the next event wins.
 */
export async function watchOrchestraState(
  orchestraId: string,
  onChange: (state: OrchestraState) => void,
): Promise<StopWatching> {
  const file = stateFile(orchestraId);

  async function emit(): Promise<void> {
    try {
      const state = await readState(orchestraId);
      if (state) {
        onChange(state);
      }
    } catch {
      // partial write / transient read error — ignore, next tick re-reads
    }
  }

  await emit();

  const watcher = chokidar.watch(file, { ignoreInitial: true });
  watcher.on('change', () => { void emit(); });
  watcher.on('add', () => { void emit(); });

  const poll = setInterval(() => { void emit(); }, 1000);

  return async () => {
    clearInterval(poll);
    await watcher.close();
  };
}
```

- [ ] **Step 4: Run, confirm PASS.** If chokidar's change event is flaky on the dev FS, the 1s poll fallback still satisfies the test within the 4s window — that is by design. Do not weaken the assertion.

- [ ] **Step 5: Commit**

```
git add src/tui/watch-state.ts tests/tui/watch-state.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): watch state.json (chokidar + 1s poll fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Keyboard reducer

**Files:** `tests/tui/keymap.test.ts`, `src/tui/keymap.ts`

The reducer is pure: it maps the current UI state + a keypress to a new UI state and an optional side-effect action. The container performs the action.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { reduceKey, type UiState, type KeyInput } from '../../src/tui/keymap.js';

function ui(over: Partial<UiState> = {}): UiState {
  return { selectedIndex: 0, musicianCount: 3, ...over };
}
function key(over: Partial<KeyInput> = {}): KeyInput {
  return { input: '', downArrow: false, upArrow: false, tab: false, shiftTab: false, return: false, ...over };
}

describe('reduceKey', () => {
  it('down arrow / j moves selection down, clamped', () => {
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ downArrow: true })).ui.selectedIndex).toBe(1);
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ input: 'j' })).ui.selectedIndex).toBe(1);
    expect(reduceKey(ui({ selectedIndex: 2, musicianCount: 3 }), key({ downArrow: true })).ui.selectedIndex).toBe(2);
  });
  it('up arrow / k moves selection up, clamped', () => {
    expect(reduceKey(ui({ selectedIndex: 2 }), key({ upArrow: true })).ui.selectedIndex).toBe(1);
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ input: 'k' })).ui.selectedIndex).toBe(0);
  });
  it('Enter emits an enter-musician action for the selected index', () => {
    const r = reduceKey(ui({ selectedIndex: 1 }), key({ return: true }));
    expect(r.action).toEqual({ kind: 'enter-musician', index: 1 });
  });
  it('Enter with zero musicians emits no action', () => {
    const r = reduceKey(ui({ selectedIndex: 0, musicianCount: 0 }), key({ return: true }));
    expect(r.action).toBeUndefined();
  });
  it('Tab emits next-orchestra, Shift-Tab prev-orchestra', () => {
    expect(reduceKey(ui(), key({ tab: true })).action).toEqual({ kind: 'next-orchestra' });
    expect(reduceKey(ui(), key({ shiftTab: true })).action).toEqual({ kind: 'prev-orchestra' });
  });
  it('n emits open-notes, d emits dismiss, q emits focus-orchestrator', () => {
    expect(reduceKey(ui(), key({ input: 'n' })).action).toEqual({ kind: 'open-notes' });
    expect(reduceKey(ui({ selectedIndex: 2 }), key({ input: 'd' })).action).toEqual({ kind: 'dismiss-musician', index: 2 });
    expect(reduceKey(ui(), key({ input: 'q' })).action).toEqual({ kind: 'focus-orchestrator' });
  });
  it('unknown key is a no-op', () => {
    const r = reduceKey(ui({ selectedIndex: 1 }), key({ input: 'z' }));
    expect(r.ui.selectedIndex).toBe(1);
    expect(r.action).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement `src/tui/keymap.ts`**

```typescript
export interface UiState {
  selectedIndex: number;
  musicianCount: number;
}

export interface KeyInput {
  input: string;
  downArrow: boolean;
  upArrow: boolean;
  tab: boolean;
  shiftTab: boolean;
  return: boolean;
}

export type KeyAction =
  | { kind: 'enter-musician'; index: number }
  | { kind: 'dismiss-musician'; index: number }
  | { kind: 'next-orchestra' }
  | { kind: 'prev-orchestra' }
  | { kind: 'open-notes' }
  | { kind: 'focus-orchestrator' };

export interface ReduceResult {
  ui: UiState;
  action?: KeyAction;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function reduceKey(ui: UiState, key: KeyInput): ReduceResult {
  const maxIndex = Math.max(0, ui.musicianCount - 1);

  if (key.downArrow || key.input === 'j') {
    return { ui: { ...ui, selectedIndex: clamp(ui.selectedIndex + 1, 0, maxIndex) } };
  }
  if (key.upArrow || key.input === 'k') {
    return { ui: { ...ui, selectedIndex: clamp(ui.selectedIndex - 1, 0, maxIndex) } };
  }
  if (key.tab) {
    return { ui, action: { kind: 'next-orchestra' } };
  }
  if (key.shiftTab) {
    return { ui, action: { kind: 'prev-orchestra' } };
  }
  if (key.return) {
    if (ui.musicianCount === 0) {
      return { ui };
    }
    return { ui, action: { kind: 'enter-musician', index: ui.selectedIndex } };
  }
  if (key.input === 'n') {
    return { ui, action: { kind: 'open-notes' } };
  }
  if (key.input === 'd') {
    if (ui.musicianCount === 0) {
      return { ui };
    }
    return { ui, action: { kind: 'dismiss-musician', index: ui.selectedIndex } };
  }
  if (key.input === 'q') {
    return { ui, action: { kind: 'focus-orchestrator' } };
  }
  return { ui };
}
```

- [ ] **Step 4: Run, confirm PASS.**

- [ ] **Step 5: Commit**

```
git add src/tui/keymap.ts tests/tui/keymap.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): pure keyboard reducer (nav + actions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Presentational components (StatusBar, Auditorium, ConcertHall)

**Files:** `src/tui/StatusBar.tsx`, `src/tui/Auditorium.tsx`, `src/tui/ConcertHall.tsx`, `tests/tui/StatusBar.test.tsx`, `tests/tui/Auditorium.test.tsx`, `tests/tui/ConcertHall.test.tsx`

All three are pure: props in, JSX out. No hooks, no side effects.

- [ ] **Step 1: Write `tests/tui/StatusBar.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../src/tui/StatusBar.js';

describe('StatusBar', () => {
  it('shows permission level and the token placeholder', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('supervised');
    expect(frame).toContain('—');
  });
  it('shows key hints', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="auto" tokenHint="—" />);
    expect(lastFrame() ?? '').toContain('nav');
  });
});
```

- [ ] **Step 2: Implement `src/tui/StatusBar.tsx`**

```tsx
import { Box, Text } from 'ink';

export interface StatusBarProps {
  permissionLevel: string;
  tokenHint: string;
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="single" borderTop={true} paddingX={1}>
      <Text>
        {props.permissionLevel} · {props.tokenHint}
      </Text>
      <Text dimColor={true}>[↑↓] nav [⏎] enter [n] notes [d] dismiss [q] back</Text>
    </Box>
  );
}
```

If `JSX.Element` is not in scope under the automatic runtime, use `import type { ReactElement } from 'react';` and return `ReactElement`. Pick whichever the build accepts; report which.

- [ ] **Step 3: Write `tests/tui/Auditorium.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Auditorium } from '../../src/tui/Auditorium.js';
import type { Musician } from '../../src/state.types.js';

function mus(over: Partial<Musician>): Musician {
  return {
    id: 'mus-001', name: 'tester', task_summary: 't', status: 'working',
    tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
    spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
    ...over,
  };
}

describe('Auditorium', () => {
  it('renders one row per musician with name and activity', () => {
    const musicians = [
      mus({ id: 'mus-001', name: 'alpha' }),
      mus({ id: 'mus-002', name: 'beta', status: 'idle' }),
    ];
    const activity = { 'mus-001': 'Running tests', 'mus-002': 'done' };
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={activity} selectedIndex={0} now="2026-05-29T10:02:00Z" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
    expect(frame).toContain('Running tests');
  });
  it('marks the selected row', () => {
    const musicians = [mus({ id: 'mus-001', name: 'alpha' })];
    const { lastFrame } = render(
      <Auditorium musicians={musicians} activity={{}} selectedIndex={0} now="2026-05-29T10:02:00Z" />,
    );
    expect(lastFrame() ?? '').toContain('▸');
  });
  it('shows an empty-state message when there are no musicians', () => {
    const { lastFrame } = render(
      <Auditorium musicians={[]} activity={{}} selectedIndex={0} now="2026-05-29T10:02:00Z" />,
    );
    expect(lastFrame() ?? '').toContain('No musicians');
  });
});
```

- [ ] **Step 4: Implement `src/tui/Auditorium.tsx`**

```tsx
import { Box, Text } from 'ink';
import type { Musician } from '../state.types.js';
import { statusIcon, statusColor } from './status-icon.js';
import { formatRelativeTime } from './format-time.js';

export interface AuditoriumProps {
  musicians: Musician[];
  activity: Record<string, string>;
  selectedIndex: number;
  now: string;
}

export function Auditorium(props: AuditoriumProps): JSX.Element {
  if (props.musicians.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold={true}>Auditorium</Text>
        <Text dimColor={true}>No musicians yet.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold={true}>Auditorium</Text>
      {props.musicians.map((m, i) => {
        const selected = i === props.selectedIndex;
        const marker = selected ? '▸' : ' ';
        const since = formatRelativeTime(m.last_activity, props.now);
        const line = props.activity[m.id] ?? '';
        return (
          <Box key={m.id} flexDirection="column">
            <Text>
              {marker} <Text color={statusColor(m.status)}>{statusIcon(m.status)}</Text> {m.id} {m.name}
            </Text>
            <Text dimColor={true}>    {since} · {line}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 5: Write `tests/tui/ConcertHall.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ConcertHall } from '../../src/tui/ConcertHall.js';
import type { OrchestraSummary } from '../../src/commands/list.js';

function orch(over: Partial<OrchestraSummary>): OrchestraSummary {
  return {
    id: 'aaa-one', project_path: '/tmp/one', permission_level: 'supervised',
    created_at: '2026-05-29T10:00:00Z', running: true, musician_count: 2, ...over,
  };
}

describe('ConcertHall', () => {
  it('lists orchestras and marks the current one', () => {
    const list = [orch({ id: 'aaa-one' }), orch({ id: 'bbb-two', running: false })];
    const { lastFrame } = render(<ConcertHall orchestras={list} currentId="aaa-one" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('aaa-one');
    expect(frame).toContain('bbb-two');
    expect(frame).toContain('▸');
  });
});
```

- [ ] **Step 6: Implement `src/tui/ConcertHall.tsx`**

```tsx
import { Box, Text } from 'ink';
import type { OrchestraSummary } from '../commands/list.js';

export interface ConcertHallProps {
  orchestras: OrchestraSummary[];
  currentId: string;
}

export function ConcertHall(props: ConcertHallProps): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="single" borderBottom={true} paddingX={1}>
      <Text bold={true}>Concert Hall</Text>
      {props.orchestras.map((o) => {
        const current = o.id === props.currentId;
        const marker = current ? '▸' : ' ';
        const dot = o.running ? '●' : '○';
        return (
          <Text key={o.id} bold={current}>
            {marker} {dot} {o.id} ({o.musician_count})
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 7: Run all three test files** — `npm test -- tui/StatusBar tui/Auditorium tui/ConcertHall`. Confirm all pass. Then `npm run build` (tsc must accept the JSX + the `JSX.Element`/`ReactElement` return type).

- [ ] **Step 8: Commit**

```
git add src/tui/StatusBar.tsx src/tui/Auditorium.tsx src/tui/ConcertHall.tsx tests/tui/StatusBar.test.tsx tests/tui/Auditorium.test.tsx tests/tui/ConcertHall.test.tsx
git commit -m "$(cat <<'EOF'
feat(tui): StatusBar, Auditorium, ConcertHall presentational components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AppView composition

**Files:** `src/tui/AppView.tsx`, `tests/tui/AppView.test.tsx`

`AppView` is the presentational composition: it arranges ConcertHall (top), Auditorium (middle), StatusBar (bottom) from props. No hooks.

- [ ] **Step 1: Write `tests/tui/AppView.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AppView } from '../../src/tui/AppView.js';
import type { Musician } from '../../src/state.types.js';
import type { OrchestraSummary } from '../../src/commands/list.js';

const musicians: Musician[] = [{
  id: 'mus-001', name: 'alpha', task_summary: 't', status: 'working',
  tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
  spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
}];
const orchestras: OrchestraSummary[] = [{
  id: 'aaa-one', project_path: '/tmp/one', permission_level: 'supervised',
  created_at: '2026-05-29T10:00:00Z', running: true, musician_count: 1,
}];

describe('AppView', () => {
  it('renders concert hall, auditorium, and status bar together', () => {
    const { lastFrame } = render(
      <AppView
        orchestras={orchestras}
        currentId="aaa-one"
        musicians={musicians}
        activity={{ 'mus-001': 'building' }}
        selectedIndex={0}
        permissionLevel="supervised"
        tokenHint="—"
        now="2026-05-29T10:01:00Z"
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Concert Hall');
    expect(frame).toContain('Auditorium');
    expect(frame).toContain('alpha');
    expect(frame).toContain('building');
    expect(frame).toContain('supervised');
  });
});
```

- [ ] **Step 2: Implement `src/tui/AppView.tsx`**

```tsx
import { Box } from 'ink';
import type { Musician } from '../state.types.js';
import type { OrchestraSummary } from '../commands/list.js';
import { ConcertHall } from './ConcertHall.js';
import { Auditorium } from './Auditorium.js';
import { StatusBar } from './StatusBar.js';

export interface AppViewProps {
  orchestras: OrchestraSummary[];
  currentId: string;
  musicians: Musician[];
  activity: Record<string, string>;
  selectedIndex: number;
  permissionLevel: string;
  tokenHint: string;
  now: string;
}

export function AppView(props: AppViewProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <ConcertHall orchestras={props.orchestras} currentId={props.currentId} />
      <Auditorium
        musicians={props.musicians}
        activity={props.activity}
        selectedIndex={props.selectedIndex}
        now={props.now}
      />
      <StatusBar permissionLevel={props.permissionLevel} tokenHint={props.tokenHint} />
    </Box>
  );
}
```

- [ ] **Step 3: Run, confirm PASS.** `npm test -- tui/AppView`.

- [ ] **Step 4: Commit**

```
git add src/tui/AppView.tsx tests/tui/AppView.test.tsx
git commit -m "$(cat <<'EOF'
feat(tui): AppView composition of the three panes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: App container (hooks + input wiring)

**Files:** `src/tui/App.tsx`

The container holds state, runs the two polling loops via effects, wires `useInput` → `reduceKey` → side effects. It is the least unit-testable piece (timers + tmux side effects), so it stays THIN: all logic it uses is already tested (reduceKey, pollActivity, watchOrchestraState, listOrchestras, selectWindow/selectPane, openNotes, dismissMusician). No new test file for App — it is covered by the manual smoke in Task 14. Keep it small enough to read in one screen.

- [ ] **Step 1: Implement `src/tui/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useApp, useInput } from 'ink';
import { AppView } from './AppView.js';
import { reduceKey } from './keymap.js';
import { pollActivity } from './poll-activity.js';
import { watchOrchestraState, type StopWatching } from './watch-state.js';
import { listOrchestras, type OrchestraSummary } from '../commands/list.js';
import { selectWindow, selectPane, sessionName } from '../tmux.js';
import { openNotes } from '../commands/notes.js';
import { dismissMusician } from '../musicians/dismiss.js';
import { readState } from '../state.js';
import type { Musician, OrchestraState } from '../state.types.js';

export interface AppProps {
  orchestraId: string;
}

export function App(props: AppProps): JSX.Element {
  const { exit } = useApp();
  const [state, setState] = useState<OrchestraState | null>(null);
  const [orchestras, setOrchestras] = useState<OrchestraSummary[]>([]);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [now, setNow] = useState(new Date().toISOString());

  // Watch state.json.
  useEffect(() => {
    let stop: StopWatching | undefined;
    void watchOrchestraState(props.orchestraId, (s) => { setState(s); }).then((fn) => { stop = fn; });
    return () => {
      if (stop) {
        void stop();
      }
    };
  }, [props.orchestraId]);

  // Poll activity + clock every 2s.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      setNow(new Date().toISOString());
      const s = await readState(props.orchestraId);
      if (s) {
        const a = await pollActivity(s);
        setActivity(a);
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 2000);
    return () => { clearInterval(timer); };
  }, [props.orchestraId]);

  // Refresh the orchestra list every 3s.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      const list = await listOrchestras();
      setOrchestras(list);
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 3000);
    return () => { clearInterval(timer); };
  }, []);

  const musicians: Musician[] = state ? state.musicians : [];
  const session = sessionName(props.orchestraId);

  useInput((input, key) => {
    // Ink reports key.tab=true for BOTH Tab and Shift-Tab (with key.shift set on
    // the latter). Disambiguate so the reducer's `tab`-before-`shiftTab` order is
    // correct: plain Tab only when shift is NOT held.
    const isTab = key.tab && !key.shift;
    const isShiftTab = key.tab && key.shift;
    const result = reduceKey(
      { selectedIndex, musicianCount: musicians.length },
      {
        input,
        downArrow: key.downArrow,
        upArrow: key.upArrow,
        tab: isTab,
        shiftTab: isShiftTab,
        return: key.return,
      },
    );
    setSelectedIndex(result.ui.selectedIndex);
    if (!result.action) {
      return;
    }
    const action = result.action;
    if (action.kind === 'enter-musician') {
      const m = musicians[action.index];
      if (m) {
        void selectWindow(session, m.tmux_window_id);
      }
      return;
    }
    if (action.kind === 'focus-orchestrator') {
      void selectPane(`${session}:0.0`);
      return;
    }
    if (action.kind === 'open-notes') {
      void openNotes(props.orchestraId);
      return;
    }
    if (action.kind === 'dismiss-musician') {
      const m = musicians[action.index];
      if (m) {
        void dismissMusician({ orchestraId: props.orchestraId, musicianId: m.id });
      }
      return;
    }
    // next-orchestra / prev-orchestra: Phase 3 leaves switching to a later
    // iteration (attaching a different session from inside Ink needs care);
    // for now these are no-ops beyond selection. Intentionally do nothing.
  });

  // `exit` is wired so a future quit key can call it; unused for now.
  void exit;

  const permissionLevel = state ? state.permission_level : '…';

  return (
    <AppView
      orchestras={orchestras}
      currentId={props.orchestraId}
      musicians={musicians}
      activity={activity}
      selectedIndex={selectedIndex}
      permissionLevel={permissionLevel}
      tokenHint="—"
      now={now}
    />
  );
}
```

NOTE on `shiftTab`: Ink exposes `key.shift` and `key.tab`; we derive shift-tab as `key.shift && key.tab`. NOTE on `next-orchestra`/`prev-orchestra`: switching the attached tmux session from within the Ink pane is deferred (documented inline) — the Concert Hall still renders all orchestras; actually switching is a Phase 3.1/Phase 4 refinement. Do NOT implement session-switching here; leave the documented no-op.

- [ ] **Step 2: Build + typecheck**

```
npm run build
npm run typecheck
npm test
```
All pass. App has no unit test (covered by Task 14 smoke), but it MUST compile cleanly and not break the suite.

- [ ] **Step 3: Self-review** — confirm explicit-block style: every `if` braced, arrow callbacks use explicit returns where they return values (the `.then((fn) => { stop = fn; })` and `setState((s)=>...)` are void bodies — fine as braced statement blocks; the `useInput((input, key) => { ... })` is a void callback — fine).

- [ ] **Step 4: Commit**

```
git add src/tui/App.tsx
git commit -m "$(cat <<'EOF'
feat(tui): App container — state watch, activity poll, input wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `nfo tui` subcommand

**Files:** `src/commands/tui.ts`, `src/cli.ts` (MODIFY)

- [ ] **Step 1: Implement `src/commands/tui.ts`**

```tsx
import { render } from 'ink';
import { App } from '../tui/App.js';
import { readState } from '../state.js';

export interface RunTuiOptions {
  orchestraId: string;
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const instance = render(<App orchestraId={opts.orchestraId} />);
  await instance.waitUntilExit();
}
```

(This file is `.tsx` because it renders JSX.)

- [ ] **Step 2: Wire the `tui` subcommand in `src/cli.ts`**

Among the other `program.command(...)` registrations (after `mcp-server`), add:

```typescript
program
  .command('tui', { hidden: true })
  .description('(internal) Run the NFO Ink TUI for an orchestra')
  .requiredOption('--orchestra-id <id>', 'Orchestra id')
  .action(async (opts: { orchestraId: string }) => {
    const { runTui } = await import('./commands/tui.js');
    await runTui({ orchestraId: opts.orchestraId });
  });
```

- [ ] **Step 3: Build + typecheck + test**

```
npm run build
npm run typecheck
npm test
```
All pass. Confirm `node dist/cli.js --help` does NOT show `tui` (hidden), and `node dist/cli.js tui --help` works.

- [ ] **Step 4: Commit**

```
git add src/commands/tui.ts src/cli.ts
git commit -m "$(cat <<'EOF'
feat(tui): hidden `nfo tui` subcommand renders the Ink app

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Launch the TUI in the right pane (launch + restore)

**Files:** `src/commands/launch.ts` (MODIFY), `src/commands/restore.ts` (MODIFY), `tests/commands/launch.test.ts` (MODIFY)

Replace the placeholder shell in the right pane with `nfo tui --orchestra-id <id>`.

- [ ] **Step 1: Update `createOrchestra` in `src/commands/launch.ts`**

Find the placeholder split:
```typescript
  const placeholderShell = `bash -c 'echo "NFO Auditorium pane (placeholder — Phase 3 ships the Ink TUI)" && echo "Orchestra: ${opts.orchestraId}" && echo "Permission: ${opts.permissionLevel}" && exec ${process.env.SHELL ?? '/bin/bash'}'`;
  await splitWindowHorizontal(`${name}:0`, 77, placeholderShell);
```
Replace with:
```typescript
  const tuiCommand = `nfo tui --orchestra-id ${opts.orchestraId}`;
  await splitWindowHorizontal(`${name}:0`, 77, tuiCommand);
```

- [ ] **Step 2: Update `restoreOrchestra` in `src/commands/restore.ts`**

Find its placeholder split:
```typescript
  const placeholderShell = `bash -c 'echo "NFO Auditorium pane (placeholder)" && echo "Restored orchestra ${orchestraId}" && exec ${process.env.SHELL ?? '/bin/bash'}'`;
  await splitWindowHorizontal(`${name}:0`, 77, placeholderShell);
```
Replace with:
```typescript
  const tuiCommand = `nfo tui --orchestra-id ${orchestraId}`;
  await splitWindowHorizontal(`${name}:0`, 77, tuiCommand);
```

- [ ] **Step 3: Update `tests/commands/launch.test.ts`**

The existing create test asserts the tmux session exists. The placeholder is gone, but in `dryRun` the session + split still happen and the tmux command text sent into the right pane is `nfo tui ...` (which won't actually run `nfo` in the test env — that's fine; the split pane just runs the command which may error, but the session and panes exist). No assertion currently checks the pane command, so no test change is strictly required. HOWEVER, add a lightweight assertion that the session has two panes after createOrchestra, to lock in the split:

Add near the end of the create test (after the mcp-config assertions):
```typescript
    const { execa } = await import('execa');
    const { stdout: paneCount } = await execa('tmux', [
      'list-panes', '-t', `${sessionName(result.orchestraId)}:0`, '-F', '#{pane_index}',
    ]);
    expect(paneCount.trim().split('\n').length).toBe(2);
```
Ensure `sessionName` is imported in the test (it already is, from prior tasks). If not, add it.

- [ ] **Step 4: Build + typecheck + test**

```
npm run build
npm test
```
All pass. The new pane-count assertion confirms the split happened.

- [ ] **Step 5: Commit**

```
git add src/commands/launch.ts src/commands/restore.ts tests/commands/launch.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): run `nfo tui` in the right pane on launch and restore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Manual end-to-end smoke

Not a code task — a verification gate. The TUI is interactive and not unit-tested at the container level, so this is where we confirm it actually renders and navigates.

- [ ] **Step 1: Build + link**

```
npm run build
npm link        # so `nfo` resolves on PATH (the split pane runs `nfo tui ...`)
```

- [ ] **Step 2: Launch a real orchestra and observe the TUI**

```
export NFO_HOME=/tmp/nfo-phase3-home
rm -rf "$NFO_HOME" /tmp/nfo-phase3-repo
mkdir /tmp/nfo-phase3-repo && cd /tmp/nfo-phase3-repo
git init -q && git commit --allow-empty -m init
nfo          # pick supervised
```
Confirm: the right pane shows the Ink TUI — "Concert Hall" with this orchestra marked, an "Auditorium" reading "No musicians yet.", and the status bar showing `supervised · —` plus key hints.

- [ ] **Step 3: Spawn a musician from the Orchestrator pane and watch the Auditorium update**

In the left (Orchestrator) pane, ask claude: "Use spawn_musician with name 'echo-test' and task 'print hello then wait'." Within ~2 s the Auditorium should show a `● mus-001 echo-test` row with an activity line. Use `↓`/`↑` to move the `▸` marker. Press `Enter` on the musician → tmux should switch to that musician's window. Switch back to window 0 (`prefix 0`). Press `q` in the TUI pane → focus returns to the Orchestrator pane.

- [ ] **Step 4: Report findings**

Document anything that didn't render or navigate as expected. Known acceptable gaps: Tab/Shift-Tab orchestra switching is a documented no-op in Phase 3; token hint is always `—`.

- [ ] **Step 5 (cleanup):** `npm unlink` is optional; leave the link if convenient for further testing.

---

## Task 15: README for Phase 3

**Files:** `README.md` (MODIFY)

- [ ] **Step 1: Update the Status section**

Replace the Phase 2 status paragraph with:

```markdown
## Status

Phase 3. Everything from Phase 2, plus a real Ink TUI in the right tmux pane: a **Concert Hall** listing all orchestras, an **Auditorium** showing the live musician roster (status icon, time since last activity, a one-line activity hint), and a status bar. Keyboard nav: `↑/↓` (or `j/k`) to move, `⏎` to jump into a Musician's tmux window, `n` to open notes, `d` to dismiss the selected Musician, `q` to return to the Orchestrator pane. Permission-prompt detection and Concert Hall orchestra-switching ship in a later phase.
```

- [ ] **Step 2: Commit**

```
git add README.md
git commit -m "$(cat <<'EOF'
docs: README for Phase 3 (Ink TUI)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final audit + tag

Verification gate. Do NOT write code except the tag.

- [ ] **Step 1: Build + typecheck + test**

```
npm run build
npm run typecheck
npm test
```
Report pass/fail and the exact test count (Phase 3 adds roughly: format-time 6, status-icon 2, activity-line 4, tmux +2, poll-activity 2, watch-state 1, keymap 7, StatusBar 2, Auditorium 3, ConcertHall 1, AppView 1 — about 31 new, for ~90 total).

- [ ] **Step 2: Style audit of Phase 3 source**

Grep every `src/tui/*.ts(x)`, `src/commands/tui.ts`, and the edited regions of `launch.ts`/`restore.ts`/`tmux.ts`/`cli.ts` for: brace-less `if`/`for`/`while`/`else`; implicit-return arrow callbacks in `.map/.filter/.find/.some/.forEach` (e.g. `.map(m => <Row/>)` — must be `.map((m) => { return <Row/>; })`). Report violations with file:line. React component bodies must be `(props) => { return (<JSX/>); }`.

- [ ] **Step 3: Commit-trailer audit**

```
git log phase-2-complete..HEAD --format='%H %s' | while read sha rest; do echo "$sha"; git log -1 --format='%b' "$sha" | grep -i 'co-authored' || echo "  NO TRAILER"; done
```
Confirm every Phase 3 commit uses `Claude Opus 4.8`.

- [ ] **Step 4: Confirm the toolchain decisions**

Report: the final pinned versions of ink / react / ink-testing-library / chokidar, and whether `JSX.Element` or `ReactElement` was used as the component return type.

- [ ] **Step 5: Tag (only if Steps 1-2 pass clean)**

```
git tag phase-3-complete
git tag -l
```

- [ ] **Step 6: Verdict** — PHASE 3 READY | NEEDS FIXES, with test summary and any Phase 4 follow-ups (e.g. permission-prompt detection, Concert Hall orchestra-switching, real token hint, shared `sanitiseName` util noted in Phase 2).
