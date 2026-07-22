# Collapsible right sidebar (auto-hide)

## Goal

The right sidebar (`SidebarHeader` + `ConcertHall` + `Auditorium` + `StatusBar`)
is a fixed 48-column `Box` in `AppView.tsx`. On narrow terminals — e.g. a phone
SSH client or a small split pane — that fixed width leaves little room for the
embedded Claude terminal on the left. This feature adds a way to reclaim that
space, manually or automatically, without touching the terminal-resize
plumbing that already reacts to `OrchestratorPane`'s `flexGrow={1}`.

## Visibility formula

Sidebar visibility is derived, not stored directly, from three inputs:

```
autoHide = autoHideMode || columns < NARROW_COLUMN_THRESHOLD
sidebarVisible = !autoHide || !orchestratorFocused
```

- `autoHideMode` — a session-local boolean toggled by **Ctrl+B**, default `false`.
- `columns` — `windowSize.columns` from Ink's `useWindowSize()`.
- `orchestratorFocused` — the existing focus flag; `true` while keystrokes are
  forwarded raw into the embedded Claude pty.
- `NARROW_COLUMN_THRESHOLD = 90` — below this width, auto-hide is forced on
  regardless of the manual toggle.

The pure function lives in `src/tui/sidebar-visibility.ts` as
`computeSidebarVisible()`, isolated from `App.tsx` so it can be unit-tested
without rendering Ink components.

## Keybindings

- **Ctrl+B** (new) — toggles `autoHideMode`. Works from both focus states:
  it is intercepted in the `useInput` callback before the branch that splits
  into focused-vs-unfocused handling, so it fires regardless of
  `orchestratorFocused`. It is suppressed while an overlay (help, notes,
  lazygit) or copy mode is active, matching how other global chords behave.
- **Ctrl+G** (unchanged) — still toggles `orchestratorFocused`. No new code
  was added for it. Because `sidebarVisible` already depends on
  `!orchestratorFocused`, focusing the sidebar via Ctrl+G naturally reveals it
  ("peek") when auto-hide is active, and returning focus to Claude re-hides it.
  This behavior falls out of the formula for free.

## Narrow-terminal behavior

When `windowSize.columns < 90`, auto-hide is forced on even if the user never
pressed Ctrl+B. Ctrl+G peek and Ctrl+B still work identically in this state —
Ctrl+B simply becomes redundant with the forced narrow state until the
terminal is widened again.

## State and persistence

`autoHideMode` is a plain `useState` in `App.tsx`, sibling to
`orchestratorFocused`. It is session-local: no DB write, no config file, no
persistence across `nfo` invocations. Restarting the TUI resets it to `false`.

## Non-goals

- No new resize math: hiding the sidebar lets `OrchestratorPane`'s
  `flexGrow={1}` reclaim the space, and the existing pty-resize effect
  (`App.tsx`, tracks `terminalCols`/`terminalRows`) picks up the new width
  automatically.
- No changes to Ctrl+G, Ctrl+Y, Ctrl+T (n/a — no such binding exists), or
  Ctrl+C behavior.
