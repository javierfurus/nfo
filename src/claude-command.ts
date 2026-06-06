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
}

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

  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--tools", opts.allowedTools.join(","));
  }

  if (opts.prompt !== undefined) {
    args.push(opts.prompt);
  }

  return args.map(shellQuote).join(" ");
}
