import { shellQuote } from "./shell-quote.js";
import type { SubagentModel } from "./state.types.js";

export interface BuildClaudeCommandOptions {
  flags: string[];
  mcpConfigPath: string;
  promptFile?: string;
  resumeSessionId?: string | null;
  prompt?: string;
  model?: SubagentModel;
  allowedTools?: string[];
  claudeConfigDir?: string;
}

const NFO_MCP_ALLOW = "mcp__nfo";

export function buildClaudeCommand(opts: BuildClaudeCommandOptions): string {
  const args = ["claude", ...opts.flags];

  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
  }

  args.push("--mcp-config", opts.mcpConfigPath);

  if (opts.promptFile) {
    args.push("--append-system-prompt-file", opts.promptFile);
  }

  if (opts.model) {
    args.push("--model", opts.model);
  }

  args.push("--allowedTools", NFO_MCP_ALLOW);

  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--tools", opts.allowedTools.join(","));
  }

  if (opts.prompt !== undefined) {
    args.push("--", opts.prompt);
  }

  const cmd = args.map(shellQuote).join(" ");
  if (opts.claudeConfigDir) {
    return `CLAUDE_CONFIG_DIR=${shellQuote(opts.claudeConfigDir)} ${cmd}`;
  }
  return cmd;
}
