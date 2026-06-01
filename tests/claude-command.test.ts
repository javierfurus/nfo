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
});
