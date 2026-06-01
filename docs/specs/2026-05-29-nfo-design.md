# NoFluffOrchestra (NFO) — Design Spec

**Status:** Draft
**Date:** 2026-05-29
**Author:** Javier Furus (with Claude)

## 1. Overview

NoFluffOrchestra (NFO) is a TUI for multi-agent work on existing codebases. It lets a user talk to one **Orchestrator** (an LLM) who spawns and coordinates **Musicians** (more LLMs) to do work in parallel or sequence. Each project gets its own **Orchestra**, scoped to one git repository. Orchestras run inside tmux for persistence across terminal disconnects and remote attach.

NFO's value proposition vs. existing tools (e.g., Gastown): you can latch onto any existing repo, the orchestra survives session loss, and the tool stays out of the way — NFO provides only the mechanics of process choreography, not opinionated workflow logic. The Orchestrator LLM decides what work to spawn and how to coordinate; NFO spawns processes, routes messages, persists state, and renders status.

## 2. Goals and non-goals

### Goals

- **Latch onto any existing git repo** with zero project-side setup beyond `nfo`.
- **Survive disconnects** so a closed terminal or dropped ssh session doesn't kill in-flight work.
- **Re-enter from anywhere** — same machine, remote ssh, by orchestra id, or by being in the repo.
- **Use the user's regular Claude Code subscription**, not the separate Agent SDK credit pool.
- **Inherit the user's Claude Code environment** — skills, CLAUDE.md, MCP servers, hooks — so agents feel like "my normal Claude."
- **Run multiple orchestras** (one per project) and let the user switch between them via the Concert Hall.
- **Persistent project memory** the Orchestrator curates over time, so context isn't lost between sessions.

### Non-goals (v1)

- Workflow templates or pre-built agent roles. The Orchestrator decides agent roles via prompting.
- Multi-user / collaborative orchestras. One user per orchestra in v1.
- A vector-indexed knowledge base. Orchestrator-written markdown notes are the entire memory layer.
- Web UI. TUI only.
- Windows-native support. Linux and macOS in v1; Windows via WSL.
- Cross-orchestra coordination. Each orchestra is independent.
- Built-in cost/usage analytics dashboards. We surface basic token counts in the status bar; deep analysis is out of scope.

## 3. Architecture

### 3.1 Stack

- **TypeScript / Node.js** end-to-end.
- **Ink** (React for terminals) for the TUI side pane.
- **tmux** for session persistence, layout, and process supervision.
- **Claude Code** (interactive `claude` CLI) for both the Orchestrator and each Musician. Interactive mode (not `claude -p` / Agent SDK) is required so usage draws from the user's regular subscription quota rather than the separate Agent SDK credit pool that takes effect 2026-06-15.
- **Git worktrees** for per-musician filesystem isolation.
- **MCP (stdio)** for the in-process tool surface NFO exposes to every claude session.

### 3.2 Process topology per orchestra

Each orchestra runs inside one tmux session named `nfo-<project-key>`. The session contains:

- **Window 0 ("main")** with two panes:
  - **Left pane (~65%)**: the Orchestrator's interactive `claude` session, started in the repo root with NFO's MCP server attached and a role-specific system prompt addendum.
  - **Right pane (~35%)**: the NFO Ink TUI process, showing the Concert Hall, Auditorium, and status bar.
- **Windows 1..N ("musicians")**: one tmux window per active Musician, each running an interactive `claude` session inside that musician's worktree directory, also with the NFO MCP server attached.

Per-session NFO config is applied via `tmux set-option -t <session>` (mouse on, status-position top, custom bindings to jump between Orchestrator and TUI panes) so user global tmux config is not affected.

### 3.3 IPC and state ownership

There is **no NFO daemon**. Three process types coordinate via the filesystem and tmux:

1. **NFO TUI** (Ink app, side pane): reads `state.json`, polls musician panes via `tmux capture-pane`, renders, and handles user keypresses. Optional — if it dies or is closed, the orchestra continues functioning.
2. **NFO MCP server** (one stdio child per `claude` session, spawned automatically via `--mcp-config`): handles tool calls (`spawn_musician`, `message_musician`, etc.) by running tmux commands directly and writing to `state.json`.
3. **`claude` sessions**: the Orchestrator and each Musician. They speak MCP to their attached NFO MCP server.

State is owned by `state.json` under the orchestra's data dir. Writes use atomic write-then-rename plus `flock` advisory locking so concurrent MCP server writes (from different `claude` sessions) cannot corrupt it.

The NFO TUI is a viewer and remote control; the MCP servers are the actuators. This separation means closing the TUI side pane does not affect running musicians.

## 4. Lifecycle

### 4.1 Launch (`$ nfo` with no arguments)

NFO's smart-launch logic:

1. **In a git repo + orchestra exists for this repo** → attach to it. If the tmux session is alive, `tmux attach`. If dead, offer to restore (see §4.3).
2. **In a git repo + no orchestra for this repo** → create a new orchestra. Prompt once for permission level (`auto` / `autonomous` / `supervised` / `strict`). If `auto` is selected, require a second explicit confirmation (§5.2). Persist to `state.json`. Initialize the data dir layout (§6.1). Create the tmux session, layout the panes, start the Orchestrator's `claude` session.
3. **Not in a git repo + orchestras exist somewhere** → if exactly one orchestra exists AND it is running, attach to it (sensible default). Otherwise, show a picker listing all known orchestras with status (running/stopped), project name, and last activity. User selects one to attach/restore.
4. **Not in a git repo + no orchestras anywhere** → error: "Open NFO in a git repository to create your first orchestra."

The project key is computed as `${sha1(absolute_repo_path).slice(0,10)}-${basename(repo_path)}`. Stable across machines that share the same absolute path; otherwise unique per machine.

### 4.2 Attaching by id (`$ nfo <id>`)

Skips repo detection. Looks up `~/.config/nfo/projects/<id>/`. Attaches if the tmux session is alive, restores if dead, errors if the id is unknown.

### 4.3 Restoration of a stopped orchestra

When NFO finds state for an orchestra but the tmux session no longer exists (machine reboot, crash, `tmux kill-server`), it offers to restore:

1. Recreate the tmux session with the same name.
2. Start the Orchestrator's `claude` session with `--resume <orchestrator_session_id>` from state.json, restoring its full conversation history.
3. For each musician in state.json marked `working` or `idle`, recreate its tmux window in its worktree and start `claude --resume <musician_session_id>`. Musicians marked `stopped` are not restored.
4. Restart the NFO Ink TUI in the side pane.

Note: Claude Code persists session conversation history to disk by default; `--resume` reads from that store.

### 4.4 Re-entry from remote (ssh)

User `ssh`'s in, runs `nfo <id>` or `nfo` from the project dir. tmux survived the absence, so `nfo` finds the live session and attaches. The orchestra never actually stopped.

### 4.5 Detach

The user hits tmux's detach binding (`prefix + d`). The orchestra continues in the background. Closing the terminal has the same effect.

### 4.6 Musician completion

A musician's `claude` session goes idle when it finishes a task. NFO determines idle status in one of two ways:

1. **Preferred**: the musician calls the `report_done` MCP tool, explicitly marking itself complete and providing a summary.
2. **Fallback**: NFO's pane-capture loop detects no output change for >30 seconds AND the bottom of the pane shows claude's input prompt (i.e., claude is waiting for user input, not mid-tool-call); marks as `idle`. This is heuristic; `report_done` is the reliable signal and the Orchestrator's prompt encourages musicians to call it.

Idle musicians remain alive in their tmux window. The Orchestrator can `message_musician` to give them new work or `dismiss_musician` to retire them.

### 4.7 Teardown (`$ nfo kill <id>`)

1. Confirm with user.
2. For each musician: send `/quit` via `tmux send-keys` (allows graceful session save), then `tmux kill-window`.
3. Prompt: archive worktrees (default), discard, or leave in place.
4. `tmux kill-session -t nfo-<id>`.
5. Archive `state.json` (move to `archive/`); leave `notes/` untouched (user may want to read them later).

## 5. The Orchestrator and Musicians

### 5.1 Agent backend

Every agent — the Orchestrator and every Musician — is an **interactive `claude` CLI session**. This is non-negotiable: it is the only mode that uses the user's regular Claude Code subscription (vs. the separate Agent SDK credit pool). Agents are spawned via `tmux new-window`, NOT via the TypeScript Agent SDK.

### 5.2 Permission level

The orchestra-wide permission level (`auto` / `autonomous` / `supervised` / `strict`) is set at first launch and stored in `state.json`. Adjustable mid-session via an NFO TUI control. Each level is passed to every `claude` session through the appropriate flag:

- **auto** → claude's bypass-permissions mode (passed via `--dangerously-skip-permissions` or `--permission-mode bypassPermissions` — exact flag confirmed at implementation time). **No prompts at all.** Musicians can run any tool, including arbitrary shell commands, network calls, and destructive operations. Worktree isolation reduces — but does not eliminate — the blast radius (a musician can still touch anything its user account can touch outside the worktree).
- **autonomous** → `--permission-mode acceptEdits`. Free file edits and common filesystem commands (mkdir, mv, cp, touch). Risky tools (most Bash, network) still need an allowlist or a prompt.
- **supervised** → `--permission-mode default`. Claude's standard prompt-on-risky-tool behavior. NFO surfaces prompts in the Auditorium (see §5.2.1).
- **strict** → `--permission-mode plan`. Read-only; no edits without explicit approval.

**Warning around `auto`:** Selecting `auto` at orchestra creation requires an explicit second confirmation. The prompt reads roughly:

> ⚠ AUTO mode disables all permission checks. Musicians can execute arbitrary shell commands, modify files anywhere on this system, and access the network without asking. Worktrees limit but do not contain risky operations. Use this only in trusted sandboxes or when you accept these risks. Type "I understand" to continue.

The same explicit confirmation gate applies when promoting an orchestra to `auto` mid-session.

The Orchestrator inherits the orchestra's level; spawned Musicians inherit the same level by default. The `spawn_musician` tool does NOT allow musicians to elevate beyond the orchestra's level (a musician spawned by a `supervised` orchestra cannot be `auto`). Musicians can be spawned at a lower (safer) level than the orchestra's — useful for risky work the Orchestrator wants to keep on a short leash.

### 5.2.1 Permission prompts

In `supervised` or `strict` mode, an agent may hit a tool call that requires approval. Their `claude` session renders a permission prompt in their tmux window. Because the user is usually looking at the Orchestrator pane, not the musician's hidden window, NFO must surface the prompt clearly.

**Detection.** The 2s pane-capture loop scans each musician's window for claude's permission-prompt pattern (recognizable text + numbered choice list). On match, NFO writes `status: "awaiting_permission"` to `state.json` for that musician along with a short summary of the tool being requested (parsed from the prompt text — best-effort).

**UI signal.** In the Auditorium, the musician's row shows `⚠ awaiting permission` with the requested tool as the activity line (e.g., `Bash: rm -rf node_modules`). The Concert Hall tab shows a `⚠` badge if any musician is in this state. The status bar summarises: `N musicians awaiting permission · [p] jump to next`.

**Response.** Pressing `p` (or selecting the musician + `Enter`) runs `tmux select-window` to that musician. The user sees claude's prompt and answers normally (claude's own 1/2/3 UI). On the next capture-pane scan NFO sees the prompt is gone and flips status back to `working`.

**Optional bell.** A config flag `notify_on_permission` (default `false`) enables a terminal bell + `notify-send`/`osascript` desktop notification when any musician enters `awaiting_permission`. Off by default to avoid annoyance during heavy parallel work.

**Explicit non-behavior.** NFO does not answer prompts on the user's behalf, does not auto-approve based on heuristics, and does not parse permission semantics. It detects and surfaces; the user answers via claude's normal UI in the musician's pane.

### 5.3 Inherited Claude Code features

Each agent is a normal interactive `claude` session and therefore inherits:

- User skills from `~/.claude/`
- Project CLAUDE.md (and parent-dir CLAUDE.md chain)
- MCP servers from `.mcp.json` (plus the NFO MCP server added on top via `--mcp-config`; this flag is additive to project/user MCP discovery in interactive mode, not replacing)
- Hooks
- User's subscription / API key auth from `~/.claude/`
- Claude Code's normal status line, slash commands, etc. (when the user is actually viewing the pane)

The one consequence to flag: a user-invoked slash command like `/code-review` is only triggerable when the user is physically focused on that musician's tmux pane and types it. Agents themselves cannot invoke user-defined slash commands. Auto-triggered (description-matched) skills work normally.

### 5.4 Prompt composition

Each `claude` session is launched with `--append-system-prompt-file <role-prompt-file>`. The prompt file contains:

- The agent's role (Orchestrator vs. Musician).
- The NFO MCP tool surface and when to use each tool.
- A statement that CLAUDE.md provides project-specific guidance and should be respected, with a tiebreaker rule: "For agent coordination decisions, prefer NFO MCP tools over Claude Code's built-in `Task` tool; NFO's tools are how the user tracks your work."

For the Orchestrator, additional content is prepended at launch:

- The contents of `notes/overview.md` and `notes/decisions.md` (Orchestrator's curated long-term memory).

Musician role prompts include a one-time task description provided by the Orchestrator at spawn time. The Claude process is launched directly in the pane (for example via `tmux respawn-pane`) with that task included in the initial command so NFO does not have to type the bootstrap prompt into an interactive shell.

## 6. NFO MCP server (tool surface)

The NFO MCP server is a stdio MCP server that NFO ships and attaches to every `claude` session via `--mcp-config /path/to/nfo-mcp-config.json`. It is a thin process per session. It executes tmux commands and writes `state.json` (with `flock`).

### Tools

**`spawn_musician`**
- Inputs:
  - `name: string` — human-friendly identifier the Orchestrator chooses (e.g., `"test-writer"`).
  - `task: string` — initial prompt sent as the first message to the new musician.
  - `worktree?: boolean` — default `true`. If `false`, the musician runs in the main repo workspace (Orchestrator must explicitly opt out for trivially isolated work like docs).
  - `branch_from?: string` — base ref for the worktree. Defaults to current `HEAD`.
- Behavior:
  1. Generate `musician_id` (`mus-<seq>`).
  2. If `worktree: true`, run `git worktree add` at `~/.config/nfo/projects/<key>/worktrees/<musician_id>` on a new branch `nfo/<musician_id>` from `branch_from`.
  3. `tmux new-window -t <session> -n mus-<id>-<name> -c <cwd>`, then `tmux respawn-pane -k -t <window>` with `claude --mcp-config ... --permission-mode <level> --append-system-prompt-file <musician-prompt> '<task>'`.
  4. Wait for `claude` to be ready (poll pane for prompt indicator, ~500ms).
  5. Follow-up iteration still uses `tmux send-keys` into the running Claude process; bootstrap no longer goes through the shell's history file.
  6. Register in `state.json` with `status: "working"`, `tmux_window_id`, `claude_session_id` (captured from claude's startup output), `worktree_path`, `branch`, `spawned_at`.
  7. Return `{ musician_id, status: "working" }`.

**`message_musician`**
- Inputs: `musician_id: string`, `message: string`.
- Behavior:
  - If `message` is short and free of shell-special chars: `tmux send-keys -l -t <window> -- <message> ; send-keys Enter`.
  - Otherwise: write to a temp file, `tmux load-buffer <tmpfile>`, `tmux paste-buffer -t <window>`, `tmux send-keys -t <window> Enter`. Avoids argv length limits and quoting hazards.
  - Mark `last_activity = now` in state.json.
  - Fire-and-forget. Returns immediately.

**`query_musician`**
- Inputs: `musician_id: string`, `lines?: number` (default 80).
- Behavior: `tmux capture-pane -p -t <window> -S -<lines>`. Returns the raw captured string.

**`list_musicians`**
- Inputs: none.
- Returns: array of `{ id, name, status, task_summary, worktree_path, spawned_at, last_activity, pending_permission? }` read from state.json. `status` is one of `"working" | "idle" | "awaiting_permission" | "stopped"`. `pending_permission` is a short string describing the requested tool, present only when `status === "awaiting_permission"`.

**`dismiss_musician`**
- Inputs: `musician_id: string`, `archive_worktree?: boolean` (default `true`).
- Behavior:
  1. `tmux send-keys -t <window> '/quit' Enter` (graceful claude shutdown; persists session for later resume if needed).
  2. Wait up to 5s for pane to close; if not, `tmux kill-window`.
  3. If `archive_worktree`, move worktree to `archive/<musician_id>/worktree/`; otherwise `git worktree remove`.
  4. Update state.json: `status: "stopped"`, retain entry in archive section.

**`report_done`** (called by Musicians)
- Inputs: `summary: string`, `next_steps?: string`.
- Behavior: marks musician as `idle` in state.json, appends summary to `logs/<musician_id>.log` and `archive/<musician_id>/summary.md`. Surfaces a notification in the Auditorium ("✓ test-writer: done"). Musician process stays alive.

**`note_write`** / **`note_read`** / **`note_list`** (Orchestrator's curated memory)
- `note_write(filename: string, content: string)` — write or replace `notes/<filename>.md`.
- `note_read(filename: string)` — return contents of `notes/<filename>.md` or empty string if missing.
- `note_list()` — return array of filenames in `notes/`.

### What the tool surface deliberately does NOT do

There is no `plan`, `decide_split`, `phase_complete`, `assign_priority`, or any other workflow-shaped verb. The tools are tmux-shaped primitives. All workflow logic lives in the Orchestrator's reasoning, not in NFO code. This is the central guard against the calcification problem.

## 7. Persistent memory

### 7.1 Directory layout

```
~/.config/nfo/
├── config.json                    # global defaults (permission level, editor, notify_on_permission)
└── projects/
    └── <project-key>/             # one dir per orchestra
        ├── state.json             # orchestra metadata, source of truth
        ├── notes/                 # Orchestrator-curated memory
        │   ├── overview.md
        │   ├── decisions.md
        │   ├── open-questions.md
        │   └── <ad-hoc>.md
        ├── logs/                  # append-only musician event logs
        │   ├── orchestrator.log
        │   └── <musician-id>.log
        ├── worktrees/             # active musicians' git worktrees
        │   └── <musician-id>/
        └── archive/               # dismissed musicians
            └── <musician-id>/
                ├── final-log.txt
                ├── summary.md
                └── worktree/      # archived if requested
```

### 7.2 state.json schema

```jsonc
{
  "orchestra_id": "a1b2c3d4ef-myproject",
  "project_path": "/home/user/projects/myproject",
  "created_at": "2026-05-29T10:00:00Z",
  "permission_level": "supervised",
  "orchestrator_session_id": "abc-123",
  "musicians": [
    {
      "id": "mus-001",
      "name": "test-writer",
      "task_summary": "add unit tests for auth.ts",
      "status": "working",                          // "working" | "idle" | "awaiting_permission" | "stopped"
      "pending_permission": null,                   // short string when status === "awaiting_permission"
      "tmux_window_id": "@7",
      "claude_session_id": "def-456",
      "worktree_path": "/home/user/.config/nfo/projects/.../worktrees/mus-001",
      "branch": "nfo/mus-001",
      "spawned_at": "2026-05-29T10:15:00Z",
      "last_activity": "2026-05-29T10:42:00Z"
    }
  ],
  "archived_musicians": [ /* same shape, plus dismissed_at and summary */ ]
}
```

### 7.3 Notes mechanics

- Plain markdown. The user can read and edit notes directly outside the TUI.
- At Orchestrator startup, `notes/overview.md` and `notes/decisions.md` are concatenated and injected via `--append-system-prompt-file`. The Orchestrator sees its prior context in every fresh session.
- The Orchestrator chooses when and what to write via `note_write`. NFO does not auto-summarize.
- No indexing, no vector search. v1 assumes notes stay small enough to fit in context.

### 7.4 Log retention

Append-only. No rotation in v1. Revisit if logs grow problematic in practice.

## 8. TUI design

### 8.1 Layout

The NFO Ink TUI runs in the right pane (~35% of terminal width, usually 40-60 columns). Three vertical sections:

```
╭─ Concert Hall ───────────────────────╮
│ ▸ myproject     ●●●◐  (4 active)     │
│   other-repo    ○○    (2 stopped)    │
│   spike         ◐     (1 idle)       │
├─ Auditorium ─────────────────────────┤
│                                      │
│ ▸ ♪ mus-001  test-writer        ●    │
│     2m · Running test suite...       │
│                                      │
│   ♪ mus-002  doc-updater        ◐    │
│     12m · ✓ done: docs/README.md     │
│                                      │
│   ♪ mus-003  refactor-auth      ●    │
│     <1s · Editing src/auth.ts        │
│                                      │
├──────────────────────────────────────┤
│ supervised · ~12k tokens this session│
│ [↑↓] nav [⏎] enter [n] notes [?]     │
╰──────────────────────────────────────╯
```

- **Concert Hall (top)**: list of all known orchestras with compact musician-icon row and counts. Current orchestra marked `▸`. Selecting another detaches the current tmux session and attaches that orchestra's session.
- **Auditorium (middle, largest)**: one row per musician. Icon (`♪`), id, name, status indicator (`●` working, `◐` idle, `○` stopped), time-since-last-activity, and a one-line "current activity" from `tmux capture-pane` heuristic.
- **Status bar (bottom)**: current permission level, an approximate session token indicator (parsed from claude's status line via `capture-pane` if recognizable; otherwise shown as `—`), context-aware key hints. NFO does not compute exact token usage in v1; the indicator is informational only.

### 8.2 Keybindings (side pane)

- `↑/↓` or `j/k` — navigate musicians
- `Enter` — `tmux select-window` to the selected musician's tmux window (full Claude Code view). Hotkey returns to TUI.
- `Tab` / `Shift-Tab` — cycle Concert Hall tabs
- `n` — `$EDITOR ~/.config/nfo/projects/<id>/notes/`
- `d` — dismiss selected musician (confirm prompt)
- `?` — keybinding overlay
- `q` — return focus to Orchestrator pane (via `tmux select-pane`)

Pane-switch hotkeys are set per-session: `prefix + e` ("enter Auditorium" → select TUI pane), `prefix + o` ("Orchestrator" → select Orchestrator pane).

### 8.3 Update mechanism

Two loops in the Ink app:

1. **State loop**: watches `state.json` via `chokidar` (with a 1-second polling fallback for filesystems that don't support inotify). Re-renders on change. Triggered by MCP servers writing state when musicians spawn/finish/get dismissed.
2. **Activity loop**: every 2 seconds, runs `tmux capture-pane -p -t <window> -S -10` for each active musician's window. Extracts the last non-empty line as the "current activity" hint. Cheap at NFO's scale (≤10 musicians per orchestra is the design point).

Heuristic-based activity parsing is intentional. The user clicks `Enter` on a musician to see real, detailed activity in their own tmux window. The Auditorium line is a status hint, not a faithful renderer.

## 9. tmux integration

### 9.1 Naming

- Session: `nfo-<project-key>`.
- Window 0: `main` (Orchestrator + TUI panes).
- Windows 1..N: `mus-<id>-<name>` (e.g., `mus-001-test-writer`).

### 9.2 Commands used

| Operation | Command (sketch) |
|---|---|
| Create session | `tmux new-session -d -s nfo-<key> -c <repo_root>` |
| Split for TUI | `tmux split-window -h -p 35 -t nfo-<key>:0 'node nfo-tui.js --orchestra <key>'` |
| Start Orchestrator | `tmux respawn-pane -k -t nfo-<key>:0.0 'claude --mcp-config ... --append-system-prompt-file ... --permission-mode ...'` |
| Spawn musician | `tmux new-window -t nfo-<key> -n 'mus-<id>-<name>' -c <worktree> 'claude --mcp-config ... --append-system-prompt-file ... --permission-mode ...'` |
| Message musician | `tmux send-keys -l -t <window> -- '<msg>' \; send-keys Enter` (or via `load-buffer`/`paste-buffer` for long messages) |
| Capture pane | `tmux capture-pane -p -t <window> -S -<n>` |
| Switch to musician | `tmux select-window -t nfo-<key>:mus-<id>-<name>` |
| Check alive | `tmux has-session -t nfo-<key>` |
| Tear down | `tmux kill-session -t nfo-<key>` |

### 9.3 Session-scoped tmux config

Applied with `tmux set-option -t <session>` so user globals are untouched:

- `mouse on` — enables clicking in the Ink TUI list.
- `status-position top` — orchestra summary at top.
- `bind-key e select-pane -t :0.1` — jump to TUI.
- `bind-key o select-pane -t :0.0` — jump to Orchestrator.

### 9.4 Input injection caveats

`tmux send-keys` semantics:

- Use `-l` (literal) plus an explicit `Enter` to avoid keystroke interpretation of message content.
- For messages longer than ~2KB or containing complex multi-line content, write to a tempfile and use `tmux load-buffer <file>` + `tmux paste-buffer -t <target>` + `tmux send-keys -t <target> Enter`. This avoids argv length limits and shell quoting issues.

## 10. CLI surface

| Command | Behavior |
|---|---|
| `nfo` | Smart launch (see §4.1). |
| `nfo <id>` | Attach or restore the named orchestra. |
| `nfo list` | List all orchestras with status, project path, last activity, id. |
| `nfo kill <id>` | Tear down. Prompts for worktree handling. |
| `nfo restore <id>` | Force-restore a stopped orchestra. Usually unneeded — `nfo <id>` auto-restores. |
| `nfo notes <id>` | Open the orchestra's `notes/` in `$EDITOR`. |
| `nfo --version` | Print version. |
| `nfo --help` | Print help. |

Deliberate omissions:

- No `nfo spawn`, `nfo message`, etc. Agent control is through the Orchestrator's chat, not the CLI.
- No `nfo daemon` — there is no daemon.

## 11. Distribution and versioning

### 11.1 Distribution

NFO ships as an npm global package (`nfo-cli` or similar; final name TBD at publish time). Install via `npm i -g <name>`. TypeScript + Node, no native compilation. Linux and macOS in v1. Windows users via WSL.

### 11.2 Claude Code compatibility

NFO depends on stable Claude Code features: `--mcp-config`, `--permission-mode`, `--append-system-prompt-file`, `--resume`, stdio MCP transport, default settings loading.

At orchestra launch NFO runs `claude --version` and refuses to start below a declared minimum version (the exact minimum will be fixed during implementation against the latest known-good Claude Code release). The error message instructs the user to upgrade.

No exact-version pinning; Claude Code updates are backwards-compatible in practice.

### 11.3 NFO versioning

Standard semver. Breaking changes to `state.json` schema bump major. State migrations on attach if the schema version on disk is older than the installed binary.

## 12. Risks and open questions

### 12.1 Risks

- **`tmux send-keys` reliability for complex input.** Edge cases around terminal control sequences in agent messages are real. Mitigation: paste-buffer path for non-trivial messages.
- **Pane-capture heuristic fragility.** "Last non-empty line" is a crude status indicator. If users find it consistently uninformative, we can extend the musician prompt to ask for periodic status lines in a known format.
- **`claude --resume` after long gaps.** Untested behavior at scale. We assume it works for any session age; if it does not, restoration falls back to fresh sessions with a re-injected context summary from `notes/`.
- **Worktree integration story.** Worktrees solve concurrent-edit safety, not API-coupling integration. The Orchestrator is responsible for sequencing dependent work and spawning explicit integration musicians when needed. This is a real cognitive load on the Orchestrator's prompting.
- **Subscription quota changes.** The 2026-06-15 split between interactive Claude Code and Agent SDK budgets is the reason NFO uses interactive `claude`. If Anthropic later changes interactive billing, NFO's billing assumption may need to be revisited.

### 12.2 Open questions (to resolve during implementation)

- Exact minimum `claude` CLI version to require.
- Exact CLI flag used for the `auto` permission level (`--dangerously-skip-permissions` vs. `--permission-mode bypassPermissions`); confirm against the installed claude version at implementation time.
- npm package name (subject to availability).
- Whether to ship the NFO MCP server as a separate npm package or bundle into the main CLI binary.
- Final color scheme and icon choices for the Ink TUI.
- Whether `report_done` should also accept a structured `artifacts` field listing files changed (would help the Orchestrator inspect outcomes), or whether `query_musician` + worktree inspection is enough for v1.

## 13. Out of scope (v1)

Repeated from §2 for clarity:

- Workflow templates / pre-built agent personas
- Multi-user orchestras
- Vector-indexed retrieval over notes/logs
- Web UI
- Native Windows
- Cross-orchestra coordination
- Cost analytics beyond basic token counts in the status bar
- Customizable themes (single default theme for v1)
- Persistent musician memory beyond the underlying `claude --resume` mechanism
