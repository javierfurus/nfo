# NFO — NoFluffOrchestra

A TUI multi-agent orchestrator that latches onto your existing repos. Built on Claude Code + tmux.

## Status

Phase 5. Everything from Phase 4, plus a `?`-toggled **help overlay** listing every keybinding in the dashboard, and the `--notify-on-permission` flag that arms a **terminal bell + cross-platform desktop notification** (`notify-send` on Linux, `osascript` on macOS) whenever any Musician enters `awaiting_permission`. Notification fires once per tick regardless of how many Musicians transition together. Token usage hint and Concert Hall orchestra-switching ship in a later phase.

Phase 4. **Permission-prompt detection** (spec §5.2.1): when a Musician's `claude` session is stuck on a permission prompt — only possible at `supervised` or `strict` permission levels — the Auditorium flips that Musician to `⚠ awaiting permission` with the requested tool as the activity line, and the status bar shows a yellow banner (`⚠ N awaiting permission · [p] jump to next`). Press `p` to jump straight to the next pending Musician's tmux window and answer claude's prompt. Detection is conservative: a three-signal AND rule over the last 20 pane lines, plus a delta-only writer so `state.json` only changes when a Musician's status actually transitions.

Phase 3. Real Ink TUI in the dashboard window: the left pane renders a live **embedded tmux client** for Claude via a PTY-backed terminal buffer, preserving Claude's ANSI colors and text styles inside Ink, while the existing right-hand sidebar keeps its app-drawn header, a **Concert Hall** listing all orchestras, an **Auditorium** showing the live musician roster (status icon, time since last activity, a one-line activity hint), and a status bar. tmux's own status/header line is disabled so only the Ink UI header is shown. Keyboard nav: `↑/↓` (or `j/k`) to move, `⏎` to jump into a Musician's tmux window, `n` to open notes, `d` to arm dismiss (press `d` again / `y` / `⏎` to confirm, `n`/`Esc` to cancel), `q` to focus Claude in the left pane, and `Ctrl+g` to return from the embedded terminal to the sidebar. While the left pane is focused, typed keys go straight to Claude/tmux. tmux quick-focus keys: `F6` jumps to the dashboard window and `F7` jumps to the Orchestrator window from anywhere in an NFO session. The bell/notification flag, `?` help overlay, real quit binding, token hint, and Concert Hall orchestra-switching ship in a later phase.

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

In a git repo: `nfo` (add `--notify-on-permission` for bell + desktop notify on permission prompts)
List orchestras: `nfo list`
Attach by id: `nfo <id>`
Tear down: `nfo kill <id>`
Open notes: `nfo notes <id>`

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

## Design

See `docs/specs/2026-05-29-nfo-design.md`.
