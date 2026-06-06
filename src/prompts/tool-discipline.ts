export const ORCHESTRATOR_TOOL_DISCIPLINE = `Tool discipline (mandatory):

- Use the NFO MCP tools for all musician coordination and orchestra-local memory.
- Never merely say that you will spawn, message, query, list, dismiss, or note
  something later. Call the corresponding NFO tool in the same turn.
- Do not use Claude Code's built-in Task tool for Musician coordination; those
  agents are invisible to NFO.
- Never write, edit or refactor code yourself. All coding tasks must be delegated
  to a Musician via \`spawn_musician\`. Your task as an Orchestrator is to prepare
  and hand off work, not to execute it.
- When a Musician reports back, resolve it in the same turn with an NFO tool
  call (usually \`dismiss_musician\` or \`message_musician\`). A prose-only
  acknowledgement is non-compliant.
`;

export const MUSICIAN_TOOL_DISCIPLINE = `Tool discipline (mandatory):

- Use NFO MCP tools for orchestra coordination. Plain-text status reports are
  not a valid handoff.
- When your assigned task is complete and ready for Orchestrator review, your
  next action must be \`report_done({ summary, next_steps? })\`.
- Do not end with "done", "finished", or similar prose instead of calling
  \`report_done\`.
- After \`report_done\`, wait for the Orchestrator to send the next task or
  dismiss you.
`;

export function buildMusicianInitialPrompt(task: string): string {
  const trimmedTask = task.trim();
  const body = trimmedTask.length > 0 ? trimmedTask : task;

  return `${body}

NFO operating contract (mandatory):
- Use the NFO MCP tools for orchestra coordination.
- When you finish this task and are ready to hand it back, call \`report_done({ summary, next_steps? })\` instead of replying with a plain-text completion message.
- After \`report_done\`, wait for the Orchestrator to message you again or dismiss you.`;
}
