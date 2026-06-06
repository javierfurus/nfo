import { describe, it, expect } from 'vitest';
import { resolveAllowedTools, ROLE_TOOLSETS } from '../../src/musicians/roles.js';

const EXPLORER_TOOLS = ["Read", "Grep", "Glob", "WebSearch", "WebFetch", "EnterWorktree", "ExitWorktree"];

describe('ROLE_TOOLSETS', () => {
  it('explorer contains exactly the 7 expected tool names', () => {
    expect(ROLE_TOOLSETS.explorer).toEqual(EXPLORER_TOOLS);
  });

  it('coder is undefined', () => {
    expect(ROLE_TOOLSETS.coder).toBeUndefined();
  });
});

describe('resolveAllowedTools', () => {
  it('role "explorer", no explicit => returns 7-item read-only array', () => {
    expect(resolveAllowedTools(undefined, 'explorer')).toEqual(EXPLORER_TOOLS);
  });

  it('role "coder", no explicit => returns undefined', () => {
    expect(resolveAllowedTools(undefined, 'coder')).toBeUndefined();
  });

  it('explicit ["Bash"] + role "explorer" => explicit wins', () => {
    expect(resolveAllowedTools(['Bash'], 'explorer')).toEqual(['Bash']);
  });

  it('no explicit, no role => undefined', () => {
    expect(resolveAllowedTools(undefined, undefined)).toBeUndefined();
  });
});
