import { describe, it, expect } from 'vitest';
import { detectPermissionPrompt } from '../../src/tui/detect-permission.js';

const BASH_PROMPT_WITH_BACKTICKS = [
  'Allow Bash to run `rm -rf node_modules`?',
  '',
  ' 1. Yes',
  ' 2. Yes, and don\'t ask again for Bash commands',
  ' 3. No, and tell Claude what to do differently (esc)',
].join('\n');

const BASH_PROMPT_NO_BACKTICKS = [
  'Allow Bash to run a command?',
  '',
  ' 1. Yes',
  ' 2. Yes, and don\'t ask again for Bash commands',
  ' 3. No, and tell Claude what to do differently (esc)',
].join('\n');

const EDIT_PROMPT = [
  'Allow Edit to modify `src/index.ts`?',
  '',
  ' 1. Yes',
  ' 2. Yes, and don\'t ask again for Edit operations',
  ' 3. No, and tell Claude what to do differently (esc)',
].join('\n');

const NUMBERED_CHOICES_NO_INTRO = [
  'Some chat content here',
  '',
  ' 1. Yes',
  ' 3. No, something else',
].join('\n');

const ALLOW_IN_CHAT_NO_CHOICES = [
  'Allow me to explain how this works.',
  'The function takes a callback and invokes it.',
  'That is all there is to it.',
].join('\n');

describe('detectPermissionPrompt', () => {
  it('returns pending:false and tool:null for an empty string', () => {
    const result = detectPermissionPrompt('');
    expect(result).toEqual({ pending: false, tool: null });
  });

  it('detects a realistic Bash prompt with backticked command', () => {
    const result = detectPermissionPrompt(BASH_PROMPT_WITH_BACKTICKS);
    expect(result.pending).toBe(true);
    expect(result.tool).not.toBeNull();
    expect(result.tool!.startsWith('Bash')).toBe(true);
    expect(result.tool!).toContain('rm -rf node_modules');
  });

  it('detects a Bash prompt without backticks and returns just the tool name', () => {
    const result = detectPermissionPrompt(BASH_PROMPT_NO_BACKTICKS);
    expect(result.pending).toBe(true);
    expect(result.tool).toBe('Bash');
  });

  it('detects an Edit-tool prompt and returns a tool starting with "Edit"', () => {
    const result = detectPermissionPrompt(EDIT_PROMPT);
    expect(result.pending).toBe(true);
    expect(result.tool!.startsWith('Edit')).toBe(true);
  });

  it('returns pending:false when "Allow" appears in chat text but no numbered choices are present', () => {
    const result = detectPermissionPrompt(ALLOW_IN_CHAT_NO_CHOICES);
    expect(result).toEqual({ pending: false, tool: null });
  });

  it('returns pending:false when numbered 1/3 choices are present but no intro pattern matches', () => {
    const result = detectPermissionPrompt(NUMBERED_CHOICES_NO_INTRO);
    expect(result).toEqual({ pending: false, tool: null });
  });

  it('truncates a tool string built from a 200-char backtick descriptor to at most 60 chars ending with "…"', () => {
    const longCommand = 'x'.repeat(200);
    const pane = [
      `Allow Bash to run \`${longCommand}\`?`,
      '',
      ' 1. Yes',
      ' 2. Yes, and don\'t ask again for Bash commands',
      ' 3. No, and tell Claude what to do differently (esc)',
    ].join('\n');
    const result = detectPermissionPrompt(pane);
    expect(result.pending).toBe(true);
    expect(result.tool).not.toBeNull();
    expect(result.tool!.length).toBeLessThanOrEqual(60);
    expect(result.tool!.endsWith('…')).toBe(true);
  });
});
