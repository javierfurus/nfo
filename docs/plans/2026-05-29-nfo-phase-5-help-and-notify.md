# NFO Phase 5 — Help Overlay + Permission Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two highest-value TUI polish items deferred from Phase 4: a `?`-toggled help overlay that lists every keybinding, and the spec §5.2.1 `notify_on_permission` config flag that triggers a terminal bell plus a platform-native desktop notification whenever a Musician enters `awaiting_permission`.

**Architecture:** A new pure presentational `Help.tsx` swaps in for the main layout when `showHelp` is toggled — no z-index gymnastics; the help screen REPLACES the column layout, and `?` toggles it back. The notify side adds an optional `notify_on_permission: boolean` field to `OrchestraState` (defaults to `false`), exposed via a new `--notify-on-permission` flag on `nfo` (launch and restore). A new `src/notify.ts` module owns the bell-write + cross-platform spawn (`notify-send` on Linux, `osascript` on macOS), with a test seam so we can verify the trigger logic without spawning real processes. App.tsx's existing permission-poller `useEffect` is extended: after applying a transition where `newStatus === 'awaiting_permission'`, it calls the notifier (guarded by the state flag) — the transition list already gives us exactly the "new-this-tick" semantics we need, so we don't have to dedup ourselves.

**Tech Stack:** No new runtime dependencies. Uses `execa@9` (already a dep) for the platform spawns, `os.platform()` from Node stdlib for the OS check, and `process.stdout.write('\x07')` for the bell. Tests stay with vitest, real-tmux harnesses where applicable, and a function-injection test seam for the notifier.

**Reference spec:** `docs/specs/2026-05-29-nfo-design.md` §5.2.1 (final paragraph — the optional bell + desktop notification was explicitly deferred from Phase 4) and §8 (TUI design — Phase 3 status bar advertised `[?] help` but the binding was pulled because no handler existed; Phase 5 puts the handler in and re-advertises).

**MANDATORY code style (applies to every task):**
- Control flow uses explicit braced multi-line blocks. NEVER the brace-less single-line form (`if (c) { return x; }`, never `if (c) return x;`). Same for `for`/`while`/`else`/`switch`.
- Arrow functions use explicit `{ return ... }` bodies — EXCEPT React component definitions returning JSX, which use `(props) => { return (<JSX/>); }`. Array callbacks: `.map((m) => { return <Row .../>; })`, never `.map(m => <Row/>)`.
- Ternaries (`a ? b : c`) ARE allowed, including inside JSX.
- Component return type: `import type { ReactElement } from 'react';` then `export function Foo(props: FooProps): ReactElement { ... }`. Never `JSX.Element`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Local git identity (Javier Furus <javierfurus@gmail.com>) is already configured — do not change it. Use the HEREDOC commit form.
- Every code task runs `npm run build` (tsc) AND `npm test` before commit — `npm test` already has a `pretest: tsc` hook, but run build explicitly too when iterating.

**Explicitly NOT in Phase 5 (defer to Phase 6+):**
- Token usage hint in the status bar. Parsing claude's status line is version-fragile; deserves its own design pass.
- Concert Hall orchestra-switching (Tab/Shift-Tab actually attaching a different tmux session from inside Ink). Non-trivial — needs care around session-handoff and detached-attach semantics.
- Folding the activity poller and permission poller into one pass. Optimization only; the two-poller layout works correctly today.
- An in-TUI keybinding to toggle `notify_on_permission`. Phase 5 sets it at launch time via the CLI flag; per-session toggling is a future ergonomic ask if the user wants it.
- Any change to the MCP tool surface or musician primitives.

---

## File Structure

```
src/
├── notify.ts                       # NEW: notifyAwaitingPermission(opts) — bell + platform notify
├── state.types.ts                  # MODIFY: + notify_on_permission?: boolean on OrchestraState; makeInitialState accepts it
├── cli.ts                          # MODIFY: --notify-on-permission flag on launch/restore commands
├── commands/
│   ├── launch.ts                   # MODIFY: thread notifyOnPermission into makeInitialState
│   └── restore.ts                  # MODIFY: --notify-on-permission overrides the stored value
├── tui/
│   ├── Help.tsx                    # NEW: presentational keybindings list
│   ├── keymap.ts                   # MODIFY: 'p' (already), add '?' → toggle-help
│   ├── StatusBar.tsx               # MODIFY: re-advertise [?] help in bottom hint
│   ├── AppView.tsx                 # MODIFY: showHelp prop; render <Help/> instead of column when true
│   └── App.tsx                     # MODIFY: showHelp state, toggle-help handler, notify on awaiting transition
tests/
├── notify.test.ts                  # NEW
├── tui/
│   ├── Help.test.tsx               # NEW
│   ├── keymap.test.ts              # MODIFY: '?' cases
│   ├── StatusBar.test.tsx          # MODIFY: [?] hint substring
│   └── AppView.test.tsx            # MODIFY: showHelp prop behavior
docs/
└── plans/
    └── 2026-05-29-nfo-phase-5-help-and-notify.md   # THIS FILE
README.md                           # MODIFY: status section reflects Phase 5
```

---

## Task 1: `notify_on_permission` schema field

**Files:**
- Modify: `src/state.types.ts`
- Modify (tests): None for this task — the schema change is purely a type extension and the existing test for `makeInitialState` covers it once expanded.

**Step 1: Read the current schema**

- [ ] Open `src/state.types.ts` and confirm the current shape:
  - `OrchestraState` has `version`, `orchestra_id`, `project_path`, `created_at`, `permission_level`, `orchestrator_session_id`, `musicians`, `archived_musicians`.
  - `makeInitialState(args: { orchestraId, projectPath, permissionLevel })` returns the seed state.

**Step 2: Add the field**

- [ ] Add `notify_on_permission?: boolean` to `OrchestraState` between `permission_level` and `orchestrator_session_id`.
- [ ] Add `notifyOnPermission?: boolean` to the `makeInitialState` args interface (optional, defaults to `false`).
- [ ] Set `notify_on_permission: args.notifyOnPermission ?? false` in the returned object.

Result (the relevant slice):

```ts
export interface OrchestraState {
  version: number;
  orchestra_id: string;
  project_path: string;
  created_at: string;
  permission_level: PermissionLevel;
  notify_on_permission?: boolean;
  orchestrator_session_id: string | null;
  musicians: Musician[];
  archived_musicians: ArchivedMusician[];
}

export function makeInitialState(args: {
  orchestraId: string;
  projectPath: string;
  permissionLevel: PermissionLevel;
  notifyOnPermission?: boolean;
}): OrchestraState {
  const now = new Date().toISOString();
  return {
    version: 1,
    orchestra_id: args.orchestraId,
    project_path: args.projectPath,
    created_at: now,
    permission_level: args.permissionLevel,
    notify_on_permission: args.notifyOnPermission ?? false,
    orchestrator_session_id: null,
    musicians: [],
    archived_musicians: [],
  };
}
```

**Step 3: Verify build + tests**

- [ ] Run `npm run build`. Expected: clean (the field is optional so existing callers compile).
- [ ] Run `npm test`. Expected: all 107 tests pass (no behavior change yet).

**Step 4: Commit**

```bash
git add src/state.types.ts
git commit -m "$(cat <<'EOF'
feat(state): notify_on_permission field on OrchestraState

Optional boolean (defaults to false), wired through makeInitialState.
Phase 5 wires the CLI flag and the App-side notifier in subsequent tasks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `notify.ts` — bell + cross-platform desktop notification

**Files:**
- Create: `src/notify.ts`
- Create: `tests/notify.test.ts`

This module owns "fire one notification" — terminal bell plus a best-effort desktop notification. Tests use a function-injection seam so we don't spawn real `notify-send` / `osascript` during the suite.

**Step 1: Write the failing test (notify.test.ts)**

- [ ] Create `tests/notify.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { notifyAwaitingPermission } from '../src/notify.js';

describe('notifyAwaitingPermission', () => {
  it('writes a BEL character to the bell sink', async () => {
    const bell = vi.fn();
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'linux',
      bell,
      spawn,
    });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bell).toHaveBeenCalledWith('\x07');
  });

  it('on linux, spawns notify-send with NFO title and count message', async () => {
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 2,
      platform: 'linux',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args] = spawn.mock.calls[0];
    expect(bin).toBe('notify-send');
    expect(args).toEqual(['NFO', '2 musicians awaiting permission']);
  });

  it('on darwin, spawns osascript with display notification AppleScript', async () => {
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'darwin',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args] = spawn.mock.calls[0];
    expect(bin).toBe('osascript');
    expect(args.length).toBe(2);
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('display notification');
    expect(args[1]).toContain('1 musician awaiting permission');
    expect(args[1]).toContain('NFO');
  });

  it('on unknown platform, fires bell only (no spawn)', async () => {
    const spawn = vi.fn();
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'win32',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('swallows spawn errors silently', async () => {
    const spawn = vi.fn().mockRejectedValue(new Error('notify-send not installed'));
    await expect(notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'linux',
      bell: vi.fn(),
      spawn,
    })).resolves.toBeUndefined();
  });

  it('uses singular noun for count=1, plural otherwise', async () => {
    const spawn1 = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({ pendingCount: 1, platform: 'linux', bell: vi.fn(), spawn: spawn1 });
    expect(spawn1.mock.calls[0][1]).toEqual(['NFO', '1 musician awaiting permission']);

    const spawnN = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({ pendingCount: 3, platform: 'linux', bell: vi.fn(), spawn: spawnN });
    expect(spawnN.mock.calls[0][1]).toEqual(['NFO', '3 musicians awaiting permission']);
  });
});
```

**Step 2: Run the test, confirm it fails**

- [ ] Run `npm test -- tests/notify.test.ts`. Expected: FAIL with "Cannot find module '../src/notify.js'" or similar.

**Step 3: Implement `src/notify.ts`**

- [ ] Create `src/notify.ts`:

```ts
import { execa } from 'execa';

export interface NotifyOptions {
  pendingCount: number;
  platform?: NodeJS.Platform;
  bell?: (text: string) => void;
  spawn?: (bin: string, args: string[]) => Promise<unknown>;
}

function defaultBell(text: string): void {
  process.stdout.write(text);
}

async function defaultSpawn(bin: string, args: string[]): Promise<unknown> {
  return execa(bin, args);
}

function pluralise(count: number): string {
  if (count === 1) {
    return '1 musician awaiting permission';
  }
  return `${count} musicians awaiting permission`;
}

/**
 * Fire a single notification: ring the terminal bell and (best-effort) spawn
 * the platform's desktop notifier. All errors are swallowed — a missing
 * notify-send / osascript / etc. must not break the orchestra.
 */
export async function notifyAwaitingPermission(opts: NotifyOptions): Promise<void> {
  const bell = opts.bell ?? defaultBell;
  const spawn = opts.spawn ?? defaultSpawn;
  const platform = opts.platform ?? process.platform;
  const message = pluralise(opts.pendingCount);

  try {
    bell('\x07');
  } catch {
    // Swallow — a broken stdout sink should never abort.
  }

  if (platform === 'linux') {
    try {
      await spawn('notify-send', ['NFO', message]);
    } catch {
      // notify-send may not be installed — best-effort only.
    }
    return;
  }

  if (platform === 'darwin') {
    const script = `display notification "${message}" with title "NFO"`;
    try {
      await spawn('osascript', ['-e', script]);
    } catch {
      // osascript should exist on macOS but swallow defensively.
    }
    return;
  }

  // Unknown platform (win32, freebsd, etc.) — bell-only.
}
```

**Step 4: Run tests, confirm green**

- [ ] Run `npm test -- tests/notify.test.ts`. Expected: 6 passing.
- [ ] Run `npm test`. Expected: 113/113 passing (107 prior + 6 new).
- [ ] Run `npm run build`. Expected: clean.

**Step 5: Commit**

```bash
git add src/notify.ts tests/notify.test.ts
git commit -m "$(cat <<'EOF'
feat(notify): notifyAwaitingPermission — bell + cross-platform desktop notify

Single-shot notification fanout: BEL to stdout plus best-effort spawn of
notify-send (linux) or osascript display notification (darwin). All
errors swallowed so a missing notifier never aborts. Function-injection
seam (bell + spawn opts) keeps tests pure — no real spawns in the suite.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `--notify-on-permission` CLI flag

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/commands/launch.ts`
- Modify: `src/commands/restore.ts`

**Step 1: Read `src/cli.ts` to find the launch and restore command registrations**

- [ ] Locate the `program` / commander setup that registers `nfo` (default action — launches in cwd) and `nfo <id>` (attaches/restores). Note exactly how `--permission-level` is wired so the new flag mirrors that style.

**Step 2: Add the flag to the launch path**

- [ ] In the default-action / launch flow in `src/cli.ts`, add:

```ts
.option('--notify-on-permission', 'bell + desktop notify when a musician awaits permission', false)
```

- [ ] Pass the new opt value through `launch` / `decideAction` / `createOrchestra`. Find every call to `createOrchestra(...)` in the codebase (likely only one in `cli.ts`) and add `notifyOnPermission: opts.notifyOnPermission`.

**Step 3: Thread it through `src/commands/launch.ts`**

- [ ] Add `notifyOnPermission?: boolean` to `CreateOrchestraOptions`.
- [ ] Pass it into `makeInitialState`:

```ts
const state = makeInitialState({
  orchestraId: opts.orchestraId,
  projectPath: opts.repoRoot,
  permissionLevel: opts.permissionLevel,
  notifyOnPermission: opts.notifyOnPermission,
});
```

**Step 4: Add the flag to the restore path**

- [ ] In `src/cli.ts` for the restore/attach command, add the same `--notify-on-permission` option.
- [ ] In `src/commands/restore.ts`, accept an optional `notifyOnPermission?: boolean` parameter on `restoreOrchestra`. When provided AND not undefined, override the stored value before reattach:

```ts
if (notifyOnPermission !== undefined) {
  state.notify_on_permission = notifyOnPermission;
  await writeState(orchestraId, state);
}
```

Place this after `readState` and before `sessionExists` checks. If you have to bring in `writeState`, import it from `../state.js`.

**Step 5: Verify**

- [ ] Run `npm run build`. Expected: clean (any missed plumbing will surface as type errors).
- [ ] Run `npm test`. Expected: 113/113 still passing. The existing launch test asserts state shape — confirm `notify_on_permission: false` appears in the seed state.
- [ ] Run `node dist/cli.js --help`. Expected: shows `--notify-on-permission` in the listed options.
- [ ] Run `node dist/cli.js <orchestra-id-or-unused> --help` for the restore subcommand. Expected: same flag listed.

**Step 6: Commit**

```bash
git add src/cli.ts src/commands/launch.ts src/commands/restore.ts
git commit -m "$(cat <<'EOF'
feat(cli): --notify-on-permission flag on launch and restore

Persists to state.json via makeInitialState on create; on restore, an
explicit flag value overrides the stored value (so users can flip it
on a re-attach without editing state.json by hand).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fire the notifier from `App.tsx` on awaiting transitions

**Files:**
- Modify: `src/tui/App.tsx`

The permission poller already produces `PermissionTransition[]` deltas. We iterate that list anyway — extend the per-transition handling to call the notifier when a Musician *enters* `awaiting_permission` AND the orchestra has `notify_on_permission: true`. We pass the CURRENT total pending count (post-transition) to the notifier so the message text matches what the StatusBar shows.

**Step 1: Read the existing permission-poll effect**

- [ ] Open `src/tui/App.tsx`. Locate the `useEffect` that calls `pollPermissions` and iterates transitions. It currently looks roughly like:

```ts
const transitions = await pollPermissions(s);
for (const t of transitions) {
  try {
    await setMusicianStatus(props.orchestraId, t.musicianId, t.newStatus, t.pendingPermission);
  } catch {
    // dismissed-race swallow
  }
}
```

**Step 2: Add the notifier import**

- [ ] At the top of `App.tsx` add:

```ts
import { notifyAwaitingPermission } from '../notify.js';
```

**Step 3: Fire after applying the transitions**

- [ ] At the bottom of the same `tick` function, AFTER the `for` loop:

```ts
const newlyAwaiting = transitions.filter((t) => { return t.newStatus === 'awaiting_permission'; });
if (newlyAwaiting.length > 0 && s.notify_on_permission === true) {
  const fresh = await readState(props.orchestraId);
  if (fresh) {
    const total = fresh.musicians.filter((m) => { return m.status === 'awaiting_permission'; }).length;
    await notifyAwaitingPermission({ pendingCount: total });
  }
}
```

Notes for the implementer:
- We re-read state AFTER applying transitions so `total` reflects the post-transition count.
- We only fire ONCE per tick even if multiple Musicians transition in the same tick (they're effectively concurrent for notification purposes — one bell, one message with the combined count).
- We use `s.notify_on_permission === true` (strict) so the field's optionality doesn't trip us up.

**Step 4: Verify**

- [ ] Run `npm run build`. Expected: clean.
- [ ] Run `npm test`. Expected: 113/113 still passing (App.tsx has no unit test, so this is a behavioral change covered by the manual smoke later).

**Step 5: Commit**

```bash
git add src/tui/App.tsx
git commit -m "$(cat <<'EOF'
feat(tui): App — fire notifier on new awaiting-permission transitions

After applying pollPermissions transitions, if notify_on_permission is
true on the state, count the post-transition awaiting total and call
notifyAwaitingPermission. One bell per tick regardless of how many
musicians transitioned — bell-storm is worse than under-notifying.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `Help.tsx` presentational component

**Files:**
- Create: `src/tui/Help.tsx`
- Create: `tests/tui/Help.test.tsx`

Pure presentational. Lists every keybinding the user might press. Single `?` line at the bottom prompts to close.

**Step 1: Write the failing test**

- [ ] Create `tests/tui/Help.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help.js';

describe('Help', () => {
  it('lists the core keybindings', () => {
    const { lastFrame } = render(<Help />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↑');
    expect(frame).toContain('Enter');
    expect(frame).toContain('n');
    expect(frame).toContain('d');
    expect(frame).toContain('p');
    expect(frame).toContain('q');
    expect(frame).toContain('?');
  });

  it('mentions notes, dismiss, jump-to-pending, focus-orchestrator', () => {
    const { lastFrame } = render(<Help />);
    const frame = (lastFrame() ?? '').toLowerCase();
    expect(frame).toContain('notes');
    expect(frame).toContain('dismiss');
    expect(frame).toContain('awaiting');
    expect(frame).toContain('orchestrator');
  });

  it('shows a close hint', () => {
    const { lastFrame } = render(<Help />);
    const frame = (lastFrame() ?? '').toLowerCase();
    expect(frame).toContain('close');
  });
});
```

**Step 2: Run the test, confirm it fails**

- [ ] Run `npm test -- tests/tui/Help.test.tsx`. Expected: FAIL with "Cannot find module '../../src/tui/Help.js'".

**Step 3: Implement `src/tui/Help.tsx`**

- [ ] Create `src/tui/Help.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

interface Row {
  key: string;
  label: string;
}

const ROWS: Row[] = [
  { key: '↑ / k', label: 'move selection up' },
  { key: '↓ / j', label: 'move selection down' },
  { key: 'Enter', label: 'jump into selected Musician\'s tmux window' },
  { key: 'n', label: 'open notes for this orchestra' },
  { key: 'd', label: 'dismiss the selected Musician' },
  { key: 'p', label: 'jump to next Musician awaiting permission' },
  { key: 'q', label: 'focus the Orchestrator pane' },
  { key: '?', label: 'toggle this help / close' },
];

export function Help(): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold={true}>Keybindings</Text>
      {ROWS.map((row) => {
        return (
          <Text key={row.key}>
            <Text color="cyan">{row.key.padEnd(8)}</Text>
            <Text> {row.label}</Text>
          </Text>
        );
      })}
      <Text dimColor={true}>Press ? to close.</Text>
    </Box>
  );
}
```

**Step 4: Run tests, confirm green**

- [ ] Run `npm test -- tests/tui/Help.test.tsx`. Expected: 3 passing.
- [ ] Run `npm test`. Expected: 116/116 (113 prior + 3 new).
- [ ] Run `npm run build`. Expected: clean.

**Step 5: Commit**

```bash
git add src/tui/Help.tsx tests/tui/Help.test.tsx
git commit -m "$(cat <<'EOF'
feat(tui): Help — presentational keybindings overlay

Lists every key the user can press in the right pane (arrows, Enter, n,
d, p, q, ?) with a one-line label. AppView will toggle this in place of
the main column when showHelp is true (next task).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `?` keybinding — extend `reduceKey` with `toggle-help`

**Files:**
- Modify: `src/tui/keymap.ts`
- Modify: `tests/tui/keymap.test.ts`

**Step 1: Read the current `reduceKey` order**

- [ ] Open `src/tui/keymap.ts`. The current order: arrows/j/k, tab, shiftTab, return, n, d, q, p. Add `?` after `p` (or any consistent placement — the order doesn't affect correctness since keys are mutually exclusive).

**Step 2: Extend the union and add the branch**

- [ ] Add `| { kind: 'toggle-help' }` to `KeyAction`.
- [ ] After the `p` branch:

```ts
if (key.input === '?') {
  return { ui, action: { kind: 'toggle-help' } };
}
```

**Step 3: Write the failing test**

- [ ] In `tests/tui/keymap.test.ts`, add:

```ts
it("'?' emits toggle-help", () => {
  const result = reduceKey(
    { selectedIndex: 0, musicianCount: 0 },
    { input: '?', downArrow: false, upArrow: false, tab: false, shiftTab: false, return: false },
  );
  expect(result.action).toEqual({ kind: 'toggle-help' });
});
```

**Step 4: Verify**

- [ ] Run `npm test`. Expected: 117/117 (116 prior + 1 new).
- [ ] Run `npm run build`. Expected: clean.

**Step 5: Commit**

```bash
git add src/tui/keymap.ts tests/tui/keymap.test.ts
git commit -m "$(cat <<'EOF'
feat(tui): keymap — add '?' toggle-help action

App.tsx will track showHelp in state and AppView will swap the main
column for <Help/> when true. The reducer stays pure; ? simply emits
the action regardless of UI state.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `AppView` + `App` wire the help overlay

**Files:**
- Modify: `src/tui/AppView.tsx`
- Modify: `src/tui/App.tsx`
- Modify: `tests/tui/AppView.test.tsx`

**Step 1: Extend `AppViewProps`**

- [ ] Open `src/tui/AppView.tsx`. Add `showHelp?: boolean` (optional, defaults to false in the function body).
- [ ] At the top of the function body, BEFORE the existing return, add:

```ts
if (props.showHelp === true) {
  return <Help />;
}
```

- [ ] Add the import `import { Help } from './Help.js';` at the top of the file.

**Step 2: Track `showHelp` in App.tsx and handle the toggle action**

- [ ] In `src/tui/App.tsx`:

  - Add a new state slot near the other `useState` declarations:

```ts
const [showHelp, setShowHelp] = useState(false);
```

  - In the `useInput` action-cascade, after the `jump-to-pending` branch, add:

```ts
if (action.kind === 'toggle-help') {
  setShowHelp((prev) => { return !prev; });
  return;
}
```

  - In the JSX, thread the prop:

```tsx
<AppView
  orchestras={orchestras}
  currentId={props.orchestraId}
  musicians={musicians}
  activity={activity}
  selectedIndex={selectedIndex}
  permissionLevel={permissionLevel}
  tokenHint="—"
  now={now}
  pendingCount={pendingCount}
  showHelp={showHelp}
/>
```

**Step 3: Update / add AppView test**

- [ ] In `tests/tui/AppView.test.tsx`, add:

```tsx
it('renders the help overlay when showHelp=true', () => {
  const { lastFrame } = render(
    <AppView
      orchestras={[]}
      currentId="abc"
      musicians={[]}
      activity={{}}
      selectedIndex={0}
      permissionLevel="supervised"
      tokenHint="—"
      now={new Date(0).toISOString()}
      pendingCount={0}
      showHelp={true}
    />,
  );
  const frame = (lastFrame() ?? '').toLowerCase();
  expect(frame).toContain('keybindings');
  expect(frame).not.toContain('auditorium');
});
```

The "not.toContain('auditorium')" check confirms the help screen REPLACES the main column (no double-rendering).

**Step 4: Verify**

- [ ] Run `npm test`. Expected: 118/118 (117 prior + 1 new). The existing AppView test still uses `showHelp` defaulted to `undefined` (i.e. falsy) — confirm it still renders the column.
- [ ] Run `npm run build`. Expected: clean.

**Step 5: Commit**

```bash
git add src/tui/App.tsx src/tui/AppView.tsx tests/tui/AppView.test.tsx
git commit -m "$(cat <<'EOF'
feat(tui): App/AppView — wire ? help overlay (toggle in/out)

showHelp lives in App as useState(false). AppView swaps the main column
layout for <Help/> when true. Pressing ? toggles; pressing ? again
closes (no separate close key needed).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Re-advertise `[?] help` in the StatusBar hint

**Files:**
- Modify: `src/tui/StatusBar.tsx`
- Modify: `tests/tui/StatusBar.test.tsx`

Phase 3 pulled `[?] help` from the bottom hint because there was no handler. Now there is. Re-add it.

**Step 1: Update the hint text**

- [ ] In `src/tui/StatusBar.tsx`, change the bottom-row hint from:

```tsx
<Text dimColor={true}>[↑↓] nav [⏎] enter [n] notes [d] dismiss [q] back</Text>
```

to:

```tsx
<Text dimColor={true}>[↑↓] nav [⏎] enter [n] notes [d] dismiss [q] back [?] help</Text>
```

**Step 2: Update existing test**

- [ ] In `tests/tui/StatusBar.test.tsx`, update at least one existing assertion (or add a new one) to require `[?] help` in the rendered frame.

```ts
it('advertises [?] help in the bottom hint', () => {
  const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" pendingCount={0} />);
  const frame = lastFrame() ?? '';
  expect(frame).toContain('[?] help');
});
```

**Step 3: Verify**

- [ ] Run `npm test`. Expected: 119/119 (118 prior + 1 new).
- [ ] Run `npm run build`. Expected: clean.

**Step 4: Commit**

```bash
git add src/tui/StatusBar.tsx tests/tui/StatusBar.test.tsx
git commit -m "$(cat <<'EOF'
feat(tui): StatusBar — re-advertise [?] help in bottom hint

Now that App.tsx has a real toggle-help handler, [?] is no longer a
dangling promise. Added to the end of the bottom dim hint line.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test (deferred to user)

**Files:** none — runtime exercise.

Setup:
- `npm run build` (no `npm link` needed unless you skipped Phase 4 — the symlink already points at `dist/cli.js`).
- Kill any existing orchestra for the test repo (`nfo kill <id>`).

Help-overlay smoke:
1. `nfo --notify-on-permission` in a throwaway repo.
2. Once attached, focus the right pane.
3. Press `?`. The right pane should swap to the Keybindings screen showing all 8 rows and the "Press ? to close." hint.
4. Press `?` again. The right pane should return to the Concert Hall / Auditorium / StatusBar column.
5. The StatusBar's bottom hint should now show `[?] help` at the end.

Notify smoke:
1. From the Orchestrator pane, spawn a Musician with a task that requires permission (same trigger as Phase 4 smoke: `Run \`rm -rf .git/no-such\` and report what happens`).
2. Within ~2 s of the permission prompt appearing in the Musician's hidden window:
   - You should hear a terminal bell (your terminal must have `audible bell` enabled).
   - On Linux: a `notify-send` desktop notification titled "NFO" with "1 musician awaiting permission".
   - On macOS: an `osascript`-driven notification (banner appears in the upper right).
3. Spawn a second Musician that also requires permission. When IT transitions, you should get a fresh notification with "2 musicians awaiting permission".
4. Answer one prompt. No additional notification fires on the awaiting → working transition.
5. Confirm the StatusBar's yellow banner count updates as expected.

Negative smoke (flag off):
1. Kill the orchestra. Restart with `nfo` (no flag).
2. Trigger a permission prompt. No bell, no desktop notification — only the in-TUI yellow banner.

- [ ] **Step 1: Run all three smokes** as described. Document any deviation.

---

## Task 10: README update

**Files:**
- Modify: `README.md`

**Step 1: Update the status section**

- [ ] Open `README.md`. Above the "Phase 4" paragraph, add:

```markdown
Phase 5. Everything from Phase 4, plus a `?`-toggled **help overlay** listing every keybinding in the right pane, and the `--notify-on-permission` flag that arms a **terminal bell + cross-platform desktop notification** (`notify-send` on Linux, `osascript` on macOS) whenever any Musician enters `awaiting_permission`. Notification fires once per tick regardless of how many Musicians transition together. Token usage hint and Concert Hall orchestra-switching ship in a later phase.
```

**Step 2: Update the Use section (if you maintain a flag list)**

- [ ] Add `--notify-on-permission` to the list of flags accepted by the launch command:

```markdown
In a git repo: `nfo` (add `--notify-on-permission` for bell + desktop notify on permission prompts)
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README for Phase 5 (help overlay + notify)

Adds a Phase 5 paragraph: ? toggle for the help overlay, and the
--notify-on-permission flag for bell + cross-platform desktop notify
on awaiting transitions. Calls out one-tick dedup.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final audit + tag

**Files:** none directly.

**Step 1: Run the full suite**

- [ ] `npm run build && npm test`. Both must be 100% clean.

**Step 2: Self-audit checklist**

- [ ] No `JSX.Element` in any Phase 5 file. `grep -n "JSX.Element" src/tui/*.tsx`.
- [ ] No shorthand control flow or implicit-return arrows in NEW Phase 5 code (read `src/notify.ts`, `src/tui/Help.tsx`, the modifications to `keymap.ts`/`AppView.tsx`/`App.tsx`/`StatusBar.tsx`, `src/cli.ts`, `src/commands/launch.ts`, `src/commands/restore.ts`). Ternaries inside JSX are fine.
- [ ] All commits in `phase-4-complete..HEAD` use the 4.8 trailer.
- [ ] `notify_on_permission` defaults to `false` everywhere — confirm by reading `makeInitialState`. A user who doesn't pass the flag must get the same UX as Phase 4.
- [ ] `notifyAwaitingPermission` swallows ALL spawn errors. A user without `notify-send` installed must still see the StatusBar banner and have no orchestrator crash.
- [ ] One notification per tick — App.tsx must NOT call `notifyAwaitingPermission` inside the per-transition loop; it must call it once at the end of the tick with the total count.
- [ ] Help overlay REPLACES the main column when shown (no double-rendering). The AppView test asserts `not.toContain('auditorium')` — confirm it passes.
- [ ] `?` toggles in BOTH directions (a single key for open and close).
- [ ] StatusBar `[?] help` advertised only when the handler exists (it always does now — fine to unconditionally advertise).
- [ ] CLI integrity: `node dist/cli.js --help` and `node dist/cli.js <whatever> --help` both render without error and show `--notify-on-permission`.
- [ ] No Phase 5 file modifies the MCP server, musician primitives, or the existing permission-level logic.

**Step 3: Tag**

```bash
git tag phase-5-complete
```

---

## Out-of-scope wrap-up (carried to Phase 6+)

A future plan should cover:

- **Token usage hint** in the StatusBar — parse claude's status line from the captured pane and surface live token / cost info. Needs care around claude version drift.
- **Concert Hall orchestra-switching** — Tab/Shift-Tab actually attaching a different tmux session from inside Ink. Needs a session-handoff mechanism (probably exec `tmux switch-client` and let Ink unmount cleanly).
- **Folding the activity poller and permission poller** into one pane-capture pass. Cuts pane I/O in half but the two-poller layout is correct today; only worth doing if the captures show up as a real cost.
- **Per-session in-TUI toggle for `notify_on_permission`** — a key binding (maybe `N`?) that writes the flag back to state.json. Currently Phase 5 sets it at launch-time only.

## Self-review

(Run before handing this plan to an implementer — confirms no spec gaps, placeholders, or type drift.)

- **Spec coverage:** §5.2.1's "Optional bell" paragraph is covered by Tasks 2–4. §8's `?` help affordance is covered by Tasks 5–8. Token hint and Concert Hall switching are explicitly deferred — listed in the wrap-up section.
- **No placeholders:** every step shows the exact code, test, command, or commit message. No "TBD" / "add appropriate error handling" / "similar to Task N".
- **Type consistency:** `notify_on_permission` (state field) and `notifyOnPermission` (input arg) are used consistently between state.types.ts, launch.ts, restore.ts, and App.tsx. `notifyAwaitingPermission` is called with the same `{ pendingCount }` argument in App.tsx as in the test.
