import { describe, expect, it } from 'vitest';
import { buildClaudeCommand } from '../src/claude-command.js';

describe('buildClaudeCommand', () => {
  it('quotes paths and appends the initial prompt as a positional argument', () => {
    const command = buildClaudeCommand({
      flags: ['--permission-mode', 'acceptEdits'],
      mcpConfigPath: '/tmp/with spaces/mcp-config.json',
      promptFile: '/tmp/with spaces/musician-prompt.md',
      model: 'haiku',
      prompt: "fix the bug in it's startup path",
    });

    expect(command).toBe(
      "'claude' '--permission-mode' 'acceptEdits' '--mcp-config' '/tmp/with spaces/mcp-config.json' '--append-system-prompt-file' '/tmp/with spaces/musician-prompt.md' '--model' 'haiku' 'fix the bug in it'\"'\"'s startup path'",
    );
  });

  it('includes resume sessions without requiring a prompt', () => {
    const command = buildClaudeCommand({
      flags: [],
      mcpConfigPath: '/tmp/mcp-config.json',
      resumeSessionId: 'session-123',
    });

    expect(command).toBe(
      "'claude' '--resume' 'session-123' '--mcp-config' '/tmp/mcp-config.json'",
    );
  });

  it('appends --tools with comma-joined list when allowedTools is provided', () => {
    const command = buildClaudeCommand({
      flags: [],
      mcpConfigPath: '/tmp/mcp-config.json',
      allowedTools: ['Read', 'Grep', 'Glob'],
    });

    expect(command).toContain("'--tools' 'Read,Grep,Glob'");
  });

  it('omits --tools when allowedTools is absent', () => {
    const command = buildClaudeCommand({
      flags: [],
      mcpConfigPath: '/tmp/mcp-config.json',
    });

    expect(command).not.toContain('--tools');
  });

  it('omits --tools when allowedTools is an empty array', () => {
    const command = buildClaudeCommand({
      flags: [],
      mcpConfigPath: '/tmp/mcp-config.json',
      allowedTools: [],
    });

    expect(command).not.toContain('--tools');
  });
});
