# NFO Phase 4 — Permission Prompt Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec §5.2.1 — detect when a Musician's `claude` session is stuck on a permission prompt, persist that to `state.json`, surface it in the Auditorium, and give the user a one-keystroke jump to the prompting Musician. The state schema already carries `status: "awaiting_permission"` and `pending_permission`; Phase 4 just populates and renders them.

**Architecture:** A pure `detectPermissionPrompt(paneText)` function recognises claude's prompt signature and (best-effort) extracts the requested tool name. A `pollPermissions(state)` fanout runs the detector across each non-stopped Musician's pane and returns a list of *transitions* — only the deltas relative to current state, so we don't write `state.json` on every tick. A new 2 s `useEffect` in `App.tsx` runs the poller and applies transitions via the existing `setMusicianStatus` updater. The Auditorium renders `pending_permission` as the activity line when status is `awaiting_permission`; the StatusBar adds a `N awaiting · [p] jump` hint; a new `jump-to-pending` action in `reduceKey` selects the first Musician in that state.

**Tech Stack:** No new dependencies. All existing: TypeScript ESM, Ink/React, vitest, execa-driven tmux. Phase 4 only adds new modules under `src/tui/` and modifies the existing Auditorium / StatusBar / keymap / App.

**Reference spec:** `docs/specs/2026-05-29-nfo-design.md` §5.2.1 (Permission prompts — detection, UI signal, response, explicit non-behavior). Also §5.2 (permission levels — only `supervised` and `strict` actually surface prompts; `accept-edits` and `auto` do not, so the detector still runs but should rarely fire).

**MANDATORY code style (applies to every task):**
- Control flow uses explicit braced multi-line blocks. Never the brace-less single-line form (`if (c) { return x; }`, never `if (c) return x;`). Same for `for`/`while`/`else`/`switch`.
- Arrow functions use explicit `{ return ... }` bodies, never implicit-return expression bodies — EXCEPT React component definitions returning JSX, which use `(props) => { return (<JSX/>); }`. Array callbacks: `.map((m) => { return <Row .../>; })`, never `.map(m => <Row/>)`.
- Ternaries (`a ? b : c`) ARE allowed, including inside JSX (`{cond ? <A/> : <B/>}`).
- Component return type: `import type { ReactElement } from 'react';` then `export function Foo(props: FooProps): ReactElement { ... }`. Never the global `JSX.Element`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Local git identity (Javier Furus <javierfurus@gmail.com>) is already configured — do not change it. Use the HEREDOC commit form.
- Every code task runs `npm run build` (tsc) AND `npm test` before commit — `npm test` already has a `pretest: tsc` hook, but run build explicitly too when iterating.

**Explicitly NOT in Phase 4 (must not creep in):**
- Bell / desktop notifications (`notify_on_permission` config flag from spec §5.2.1 final paragraph). Defer to Phase 5.
- `?` help overlay. Defer to Phase 5.
- Real `q` / Escape quit via `useApp().exit`. The right pane is meant to always render — quitting it would just leave a `remain-on-exit` shell. `q` continues to mean `focus-orchestrator`. Defer to Phase 5.
- Token usage hint in the status bar. Defer to Phase 5.
- Concert Hall orchestra-switching (Tab/Shift-Tab actually attaching a different session). Defer to Phase 5.
- Auto-approving prompts, parsing permission semantics, or sending keystrokes to the Musician's pane on the user's behalf (spec §5.2.1 "Explicit non-behavior"). NFO only detects and surfaces.
- Any change to the MCP server, musician primitives, or non-`status`/`pending_permission` parts of the state schema.

---

## File Structure

```
src/
├── tui/
│   ├── detect-permission.ts     # NEW: pure detectPermissionPrompt(paneText) → { pending, tool? }
│   ├── poll-permission.ts       # NEW: pollPermissions(state) → PermissionTransition[]
│   ├── keymap.ts                # MODIFY: add 'p' → jump-to-pending action
│   ├── StatusBar.tsx            # MODIFY: optional pendingCount banner + [p] hint
│   ├── Auditorium.tsx           # MODIFY: render pending_permission as activity when awaiting
│   ├── AppView.tsx              # MODIFY: thread pendingCount + selectedIndex through
│   └── App.tsx                  # MODIFY: poll-permission effect + jump-to-pending handler
tests/
├── tui/
│   ├── detect-permission.test.ts   # NEW
│   ├── poll-permission.test.ts     # NEW
│   ├── keymap.test.ts              # MODIFY: add 'p' cases
│   ├── StatusBar.test.tsx          # MODIFY: pending banner render
│   ├── Auditorium.test.tsx         # MODIFY: awaiting state rendering
│   └── AppView.test.tsx            # MODIFY: pending props plumb-through
docs/
└── plans/
    └── 2026-05-29-nfo-phase-4-permission-prompts.md   # THIS FILE
README.md                           # MODIFY: status section reflects Phase 4
```

No changes to `package.json`, `tsconfig.json`, `vitest.config.ts`, state schema, MCP server, or musician primitives.

---

## Task 1: Pure detector — `detectPermissionPrompt`

**Files:** `src/tui/detect-permission.ts`, `tests/tui/detect-permission.test.ts`

The detector is the load-bearing piece. It runs on captured pane text (last ~20 lines) and returns whether a permission prompt is on screen plus a best-effort tool summary. It MUST be pure — no I/O, no state — and conservative: prefer false negatives over false positives. A false positive would falsely lock a Musician in `awaiting_permission` and trigger UI noise; a false negative just delays detection by one 2 s tick (acceptable, since claude's prompt persists until answered).

**Signature**

```ts
export interface PermissionDetection {
  pending: boolean;
  tool: string | null;   // null when pending=false OR when we can't parse a tool name
}

export function detectPermissionPrompt(paneText: string): PermissionDetection;
```

**Detection heuristic (be conservative — combine multiple signals):**

claude's permission prompt in the terminal has this rough shape (varies slightly by version, but the structural signal is stable):

```
Allow Bash to run `rm -rf node_modules`?

 1. Yes
 2. Yes, and don't ask again for Bash commands
 3. No, and tell Claude what to do differently (esc)

❯ 1
```

The detector should require ALL of:
1. A "Yes" line that starts (after leading whitespace) with `1.` or `1)`.
2. A "No" line that starts (after leading whitespace) with a small digit (`2.`/`3.`) and contains `No` (case-sensitive, since claude capitalises it).
3. The text matches one of these prompt-introduction patterns (case-insensitive, regex):
   - `/allow\s+\S+/i`
   - `/do you want to/i`
   - `/permission required/i`
   - `/use this tool/i`

Requiring (1) AND (2) AND (3) makes the detector resistant to incidental text that mentions "Yes/No" or "Allow" in passing (e.g. a code comment scrolled into the pane). All three signals together is a near-unmistakable claude prompt.

Scan the LAST 20 non-empty lines of `paneText` (claude redraws the prompt at the bottom of its pane). The detector takes the full text; let it split and search internally.

**Tool name extraction (best-effort, NEVER throw):**

When pending=true, try to extract a short tool descriptor:

- Match `/^Allow ([A-Z][A-Za-z]+)/m` against the prompt block — captures `Bash`, `Edit`, `Write`, etc.
- If that matches AND the same line contains backticked content (`` ` ... ` ``), include up to 40 chars of it: `` Bash: `rm -rf node_modules` ``.
- If only the tool name matches, return just that: `Bash`.
- If neither matches, return `null` (the UI will render a generic "tool" string).

Truncate the final string to 60 chars with `…` if longer.

**Edge cases (cover with tests):**
- Empty string → `{ pending: false, tool: null }`.
- Random output with the word "Allow" but no numbered choices → `pending: false`.
- A "Yes/No" question from claude's chat output (not a permission prompt) → `pending: false` because the strict numbered choice format is absent.
- Prompt with a really long command in backticks → tool is truncated to 60 chars + `…`.
- Prompt where the tool is just `Read` with no backticks → tool: `"Read"`.

**Tests** (`tests/tui/detect-permission.test.ts`):

- [ ] **Step 1: Write the detector**
  - [ ] Create `src/tui/detect-permission.ts` with the `PermissionDetection` interface and `detectPermissionPrompt` function as specified.
  - [ ] Implementation: split on `\n`, take last 20 non-empty lines, run the three signal checks. Use explicit braced blocks.
  - [ ] Run `npm run build`.
- [ ] **Step 2: Write detector tests** — minimum cases:
  - [ ] Empty input → `{ pending: false, tool: null }`.
  - [ ] Realistic prompt sample (Bash with backticked command) → `pending: true`, `tool: "Bash: `rm -rf node_modules`"` (or close — assert `startsWith("Bash")` and contains the command).
  - [ ] Same prompt without backticks → `pending: true`, `tool: "Bash"`.
  - [ ] Edit-tool prompt → `pending: true`, `tool` starts with `"Edit"`.
  - [ ] Pane with "Allow me to explain" in chat output, no numbered choices → `pending: false`.
  - [ ] Pane with numbered choices but no "Allow"/"Do you want to" intro → `pending: false`.
  - [ ] 200-char tool description → `tool.length <= 60`, ends with `…`.
- [ ] **Step 3: Run tests** — `npm test`.
- [ ] **Step 4: Commit** — `feat(tui): detect-permission — pure claude permission-prompt detector` with the 4.7 trailer.

---

## Task 2: Permission poller — `pollPermissions`

**Files:** `src/tui/poll-permission.ts`, `tests/tui/poll-permission.test.ts`

Wraps the detector with the per-Musician fanout and produces *transitions only*. Returning transitions (deltas) instead of a full status map keeps `App.tsx` from writing `state.json` on every tick — which would chokidar-storm the watcher.

**Signature**

```ts
import { capturePane, sessionName } from '../tmux.js';
import { detectPermissionPrompt } from './detect-permission.js';
import type { OrchestraState } from '../state.types.js';

export interface PermissionTransition {
  musicianId: string;
  newStatus: 'awaiting_permission' | 'working';
  pendingPermission: string | null;
}

export async function pollPermissions(state: OrchestraState): Promise<PermissionTransition[]>;
```

**Logic per Musician:**

- Skip if `status === 'stopped'`.
- `capturePane(\`${session}:${m.tmux_window_id}\`, 20)` — request 20 lines.
- Run `detectPermissionPrompt(paneText)`.
- Compute transition:
  - If `detected.pending && m.status !== 'awaiting_permission'` → emit `{ musicianId, newStatus: 'awaiting_permission', pendingPermission: detected.tool ?? 'tool' }`.
  - If `!detected.pending && m.status === 'awaiting_permission'` → emit `{ musicianId, newStatus: 'working', pendingPermission: null }`.
  - Otherwise (no change) → emit nothing for this Musician.
- `try/catch` per Musician; on error, swallow (same pattern as `pollActivity`). A dead window must not break the poll.

Use a regular `for` loop with `try { ... } catch { /* swallow */ }`, NOT `Promise.all` — the per-Musician failure isolation matters more than the parallel speedup (we poll at most a handful of windows).

**Tests** (`tests/tui/poll-permission.test.ts`):

The poller has a real I/O dependency (`capturePane`). Two strategies — choose whichever is simpler in this codebase's existing test style:

- **Strategy A (preferred): real tmux session.** Same pattern as `tests/tui/poll-activity.test.ts` (which is real-tmux). Create a session, create a window with text that matches a permission prompt, build a fake `OrchestraState` with one Musician pointing to that window. Assert one `awaiting_permission` transition. Then send keys to clear the prompt-like text, poll again, assert one `working` transition.
- **Strategy B (fallback): module mock.** `vi.mock('../../src/tmux.js', ...)`. Only use this if Strategy A turns out to be flaky.

Pick A. If you hit obstacles, document and fall back to B.

- [ ] **Step 1: Write the poller** with explicit braced control flow.
- [ ] **Step 2: Write the test** following the pattern of `poll-activity.test.ts`:
  - [ ] Real tmux session created in `beforeEach`, killed in `afterEach`.
  - [ ] One Musician fixture in a synthetic `OrchestraState`.
  - [ ] Case 1: write prompt-shaped text into the window's pane, status=`working` → expect one transition to `awaiting_permission` with non-null `pendingPermission`.
  - [ ] Case 2: clear the pane (`tmux send-keys -t ... 'clear' Enter`), status=`awaiting_permission` → expect transition back to `working`, `pendingPermission: null`.
  - [ ] Case 3: status=`stopped` → no transition emitted regardless of pane content.
  - [ ] Case 4: musician pointing at a window that doesn't exist → no transition (error swallowed).
- [ ] **Step 3: Run tests** — `npm test`.
- [ ] **Step 4: Commit** — `feat(tui): poll-permission — per-musician detector fanout with transition deltas`.

---

## Task 3: Extend `reduceKey` with `jump-to-pending`

**Files:** `src/tui/keymap.ts`, `tests/tui/keymap.test.ts`

Add a new `'p'` keybinding that emits a `jump-to-pending` action. App.tsx resolves the target Musician (the first one whose `status === 'awaiting_permission'`) at handle time — the reducer is pure and doesn't know the musician list contents.

**Changes to `keymap.ts`:**

- Extend `KeyAction` union with `| { kind: 'jump-to-pending' }`.
- Insert in `reduceKey`, after the `q` branch, before the final `return { ui }`:

```ts
if (key.input === 'p') {
  return { ui, action: { kind: 'jump-to-pending' } };
}
```

Maintain the existing precedence ordering. `p` does NOT need a guard on musician count — the App can no-op if there's no pending Musician, but the action should be emitted unconditionally so the keymap reducer stays simple.

**Changes to test:**

- [ ] **Step 1: Update `KeyAction` type and reducer** as above. Keep all existing behavior intact.
- [ ] **Step 2: Add test cases** in `tests/tui/keymap.test.ts`:
  - [ ] `p` with non-zero musician count → returns `{ kind: 'jump-to-pending' }`.
  - [ ] `p` with zero musicians → still returns `{ kind: 'jump-to-pending' }` (App resolves and no-ops if there's nothing pending).
- [ ] **Step 3: Run tests** — `npm test`.
- [ ] **Step 4: Commit** — `feat(tui): keymap — add 'p' jump-to-pending action`.

---

## Task 4: Auditorium renders `pending_permission` as activity

**Files:** `src/tui/Auditorium.tsx`, `tests/tui/Auditorium.test.tsx`

When a Musician's `status === 'awaiting_permission'`, the activity line should show `pending_permission` (the tool descriptor) prefixed with `awaiting:` — NOT the captured pane line.

**Change to `Auditorium.tsx`:**

Inside the `.map((m, i) => { ... })` body, compute `line` as:

```ts
const line = m.status === 'awaiting_permission'
  ? `awaiting: ${m.pending_permission ?? 'tool'}`
  : (props.activity[m.id] ?? '');
```

(Ternary inside an assignment is allowed by style — see the style rules at top.)

The status icon and color already flip to `⚠` / yellow via the existing `statusIcon`/`statusColor` from Phase 3 — no change there.

**Tests:**

- [ ] **Step 1: Modify Auditorium.tsx** as above. Keep the empty-state branch and all other behavior.
- [ ] **Step 2: Add a test case** to `tests/tui/Auditorium.test.tsx`:
  - [ ] Render with one Musician whose `status: 'awaiting_permission'`, `pending_permission: 'Bash: `rm -rf foo`'` → `lastFrame()` contains `awaiting: Bash:` AND `⚠`.
  - [ ] Render with the same Musician but `pending_permission: null` → contains `awaiting: tool`.
- [ ] **Step 3: Run tests** — `npm test`.
- [ ] **Step 4: Commit** — `feat(tui): Auditorium — render pending_permission for awaiting musicians`.

---

## Task 5: StatusBar shows pending count + `[p] jump`

**Files:** `src/tui/StatusBar.tsx`, `src/tui/AppView.tsx`, `tests/tui/StatusBar.test.tsx`, `tests/tui/AppView.test.tsx`

Add a `pendingCount: number` prop to `StatusBar`. When > 0, render a top line above the existing first row:

```
⚠ N awaiting permission · [p] jump to next
supervised · —
[↑↓] nav [⏎] enter [n] notes [d] dismiss [q] back
```

When `pendingCount === 0`, render exactly as today — no first line. The second line of key hints stays as-is (we are deliberately NOT advertising `[p]` in the bottom hints when there's nothing to jump to, to avoid teaching the user a key that does nothing in the common case).

**Change to `StatusBar.tsx`:**

```tsx
export interface StatusBarProps {
  permissionLevel: string;
  tokenHint: string;
  pendingCount: number;
}

export function StatusBar(props: StatusBarProps): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderTop={true} paddingX={1}>
      {props.pendingCount > 0 ? (
        <Text color="yellow">⚠ {props.pendingCount} awaiting permission · [p] jump to next</Text>
      ) : null}
      <Text>
        {props.permissionLevel} · {props.tokenHint}
      </Text>
      <Text dimColor={true}>[↑↓] nav [⏎] enter [n] notes [d] dismiss [q] back</Text>
    </Box>
  );
}
```

**Change to `AppView.tsx`:**

Add `pendingCount: number` to `AppViewProps`. Plumb it down to `<StatusBar pendingCount={props.pendingCount} ... />`.

**Tests:**

- [ ] **Step 1: Modify StatusBar.tsx** to accept and conditionally render `pendingCount`.
- [ ] **Step 2: Modify AppView.tsx** to plumb the new prop.
- [ ] **Step 3: Update tests:**
  - [ ] `tests/tui/StatusBar.test.tsx`: existing test passes `pendingCount: 0` and asserts the banner is ABSENT; a new test passes `pendingCount: 2` and asserts the banner IS present (`2 awaiting permission` substring).
  - [ ] `tests/tui/AppView.test.tsx`: pass `pendingCount: 1`, assert the banner substring appears in `lastFrame()`.
- [ ] **Step 4: Run tests** — `npm test`.
- [ ] **Step 5: Commit** — `feat(tui): StatusBar/AppView — pending-permission banner + [p] hint`.

---

## Task 6: App.tsx — poll permissions, write transitions, handle `jump-to-pending`

**Files:** `src/tui/App.tsx`

This is the integration task. Three changes to `App.tsx`:

**A. New `useEffect` for permission polling (2 s interval, like the activity poller):**

```ts
useEffect(() => {
  const tick = async (): Promise<void> => {
    const s = await readState(props.orchestraId);
    if (!s) {
      return;
    }
    const transitions = await pollPermissions(s);
    for (const t of transitions) {
      try {
        await setMusicianStatus(
          props.orchestraId,
          t.musicianId,
          t.newStatus,
          t.pendingPermission,
        );
      } catch {
        // Musician may have been dismissed between poll and write; safe to swallow.
      }
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 2000);
  return () => { clearInterval(timer); };
}, [props.orchestraId]);
```

Place this AFTER the existing activity poll effect for clarity. The two pollers are independent — both run on a 2 s cadence; they could be folded but separation makes the responsibilities obvious and keeps `pollActivity` purely ephemeral while `pollPermissions` is durable.

Imports to add at the top:

```ts
import { pollPermissions } from './poll-permission.js';
import { setMusicianStatus } from '../state-updaters.js';
```

**B. Handle the new `jump-to-pending` action in the `useInput` cascade:**

After the `dismiss-musician` branch, before the no-op comment for `next/prev-orchestra`:

```ts
if (action.kind === 'jump-to-pending') {
  const pending = musicians.find((m) => { return m.status === 'awaiting_permission'; });
  if (pending) {
    void selectWindow(session, pending.tmux_window_id);
  }
  return;
}
```

**C. Compute and pass `pendingCount` to `<AppView>`:**

```ts
const pendingCount = musicians.filter((m) => { return m.status === 'awaiting_permission'; }).length;
```

Then pass it through: `<AppView ... pendingCount={pendingCount} />`.

- [ ] **Step 1: Add the new useEffect** in App.tsx after the activity poller.
- [ ] **Step 2: Add imports** for `pollPermissions` and `setMusicianStatus`.
- [ ] **Step 3: Extend the action cascade** with the `jump-to-pending` branch.
- [ ] **Step 4: Compute `pendingCount`** and thread it into `<AppView>`.
- [ ] **Step 5: Verify** — `npm run build` clean, `npm test` all pass.
- [ ] **Step 6: Commit** — `feat(tui): App — wire permission poller, jump-to-pending, pendingCount`.

App.tsx is the only file in this plan without a dedicated unit test (it's a thin integration container, mirroring Phase 3's decision). It's covered by the Task 7 manual smoke and by the components' unit tests.

---

## Task 7: Manual smoke test (deferred to user)

**Files:** none — runtime exercise.

Setup:
- `npm run build && npm link` (if not already linked since Phase 3).
- Run `nfo` in a throwaway repo to launch an orchestra at `supervised` level (the default).

Steps:
1. From the Orchestrator pane, ask claude to spawn a musician with a task that will hit a permission prompt: e.g. `spawn_musician({ name: "rm-tester", task: "Run `rm -rf .git/no-such` and report what happens" })`. With `supervised`, the Bash invocation should trigger a permission prompt in the musician's pane.
2. Watch the Auditorium in the right pane (within ~2 s):
   - The musician's status icon flips to `⚠` (yellow).
   - The activity line shows `awaiting: Bash: ...`.
   - The StatusBar shows the yellow banner `⚠ 1 awaiting permission · [p] jump to next`.
3. Press `p` in the right pane — the tmux session should switch to the musician's window, showing claude's permission prompt.
4. Answer the prompt (`3` for No, or `1` to allow). Press `q` (or use prefix-arrow) to return to the orchestrator window; the right pane should still be there.
5. Within ~2 s, the Auditorium row flips back to `●` (green) and the StatusBar banner disappears.

If any step fails, the most likely culprits are the detector's pattern matching (Task 1 — adjust signals to match the actual claude version's prompt shape) or the chokidar/poll race in App.tsx (transitions race against the state watcher refresh).

- [ ] **Step 1: Run the manual smoke** as described. Document any deviation from expected behavior.

---

## Task 8: README update

**Files:** `README.md`

**Status section update.** Append to the "Status" paragraph:

> Phase 4 adds permission-prompt detection: when a Musician's claude session is stuck on a permission prompt (only possible in `supervised` or `strict` mode), the Auditorium flips that Musician to `⚠ awaiting permission`, the status bar shows a yellow banner, and `p` jumps you straight to that Musician's tmux window so you can answer claude's prompt. The bell/notification flag, `?` help overlay, real quit, token hint, and Concert Hall switching ship in a later phase.

**Keybindings list.** If you maintain a keybindings paragraph in README, add `p` → "jump to next Musician awaiting permission" (only meaningful when one or more are).

- [ ] **Step 1: Edit README.md** — status paragraph and (if applicable) keybindings list.
- [ ] **Step 2: Commit** — `docs: README for Phase 4`.

---

## Task 9: Final audit + tag

**Files:** none directly.

- [ ] **Step 1: Run the full suite** — `npm run build && npm test`. Both must be 100% clean.
- [ ] **Step 2: Self-audit checklist:**
  - [ ] No `JSX.Element` in any Phase 4 file (all components use `ReactElement`).
  - [ ] No shorthand control flow or implicit-return arrow callbacks in any Phase 4 file (`grep -nE "=>\s*[^{(]" src/tui/*.ts src/tui/*.tsx` should not produce hits in new code).
  - [ ] All commits on `feat/ink-app` since the `phase-3-complete` tag use the 4.7 trailer.
  - [ ] `pollPermissions` emits ZERO transitions when state is unchanged (no chokidar storm).
  - [ ] The detector's three-signal AND rule actually fires only on real prompts — re-read Task 1's edge cases against your implementation.
  - [ ] `jump-to-pending` no-ops gracefully when no Musician is pending.
  - [ ] StatusBar banner is hidden when `pendingCount === 0` (no empty `⚠` row).
  - [ ] Auditorium falls back to `awaiting: tool` when `pending_permission` is null.
  - [ ] No Phase 4 file modifies state schema, MCP server, or musician primitives.
  - [ ] `nfo tui --help` and `nfo --help` still render without errors (no accidental command-registration changes).
- [ ] **Step 3: Tag** — `git tag phase-4-complete`.

---

## Out-of-scope wrap-up (carried to Phase 5)

A future Phase 5 plan should cover the items deferred here:

- `notify_on_permission` config flag with terminal bell + `notify-send` / `osascript` desktop notification.
- `?` help overlay (toggle key showing all key bindings).
- Real quit binding (Ctrl+C is already handled by Ink; consider Escape or `Q` if there's value in an explicit user-facing quit beyond what tmux already provides).
- Token usage hint — parse claude's status line from the captured pane and surface to the StatusBar.
- Concert Hall orchestra-switching — Tab/Shift-Tab actually swapping the attached session.
- Re-evaluating whether the activity and permission pollers should be folded into a single pass (they currently capture the same pane twice).
