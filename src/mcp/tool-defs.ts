export interface NfoToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const NFO_TOOLS: NfoToolDef[] = [
  {
    name: "spawn_musician",
    description:
      "Spawn a new Musician (a Claude Code subagent) to work on a task in an isolated git worktree. Use this for delegation instead of describing work in chat. Returns the musician_id. Haiku is perfect for trivial tasks while Sonnett is better for complex ones; both are strong at code. If you don't know which to choose, sonnet is a good default.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Human-friendly identifier (e.g. "test-writer")',
        },
        task: {
          type: "string",
          description: "Initial task prompt sent as the first message",
        },
        worktree: {
          type: "boolean",
          description:
            "Default true. Pass false for trivially-isolated work that does not need a worktree.",
        },
        branch_from: {
          type: "string",
          description: "Optional base ref (defaults to HEAD).",
        },
        model: {
          type: "string",
          enum: ["sonnet", "haiku"],
          description: "Optional subagent model (defaults to sonnet).",
        },
      },
      required: ["name", "task"],
      additionalProperties: false,
    },
  },
  {
    name: "message_musician",
    description:
      "Send a message to a Musician. Use this for iteration/follow-up instead of plain chat. If they are idle it is delivered now; otherwise it is queued and auto-delivered on the next idle boundary.",
    inputSchema: {
      type: "object",
      properties: {
        musician_id: { type: "string" },
        message: { type: "string" },
      },
      required: ["musician_id", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "query_musician",
    description:
      "Read the most recent visible output from a Musician's tmux pane. Returns the captured text.",
    inputSchema: {
      type: "object",
      properties: {
        musician_id: { type: "string" },
        lines: { type: "integer", description: "Default 80." },
      },
      required: ["musician_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_musicians",
    description:
      "List all currently-active Musicians with their status and metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dismiss_musician",
    description:
      "Tear down a Musician. Use this to accept and close out work rather than saying the Musician is done in prose. Archives the worktree by default (branch preserved); pass archive_worktree=false to drop everything.",
    inputSchema: {
      type: "object",
      properties: {
        musician_id: { type: "string" },
        archive_worktree: { type: "boolean" },
        summary: { type: "string" },
      },
      required: ["musician_id"],
      additionalProperties: false,
    },
  },
  {
    name: "report_done",
    description:
      "Called by a Musician to hand work back to the Orchestrator and mark itself as idle/done. Musicians must use this instead of plain-text completion messages. Queued follow-up messages are delivered automatically; otherwise the completion report is pushed back to the Orchestrator for dismiss-vs-iterate triage.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        next_steps: { type: "string" },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
  {
    name: "note_write",
    description:
      "Write (or replace) a note file under the orchestra's notes/ directory.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: 'Filename with no path separators, e.g. "overview.md".',
        },
        content: { type: "string" },
      },
      required: ["filename", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "note_read",
    description:
      "Read a note file from the orchestra's notes/ directory. Returns the contents, or empty string if missing.",
    inputSchema: {
      type: "object",
      properties: { filename: { type: "string" } },
      required: ["filename"],
      additionalProperties: false,
    },
  },
  {
    name: "note_list",
    description: "List all files in the orchestra's notes/ directory.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
