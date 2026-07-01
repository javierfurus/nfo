import { describe, expect, it } from 'vitest';
import { ORCHESTRATOR_ROLE_PROMPT_V1 } from '../../src/prompts/orchestrator-role.js';
import { MUSICIAN_ROLE_PROMPT_V1 } from '../../src/prompts/musician-role.js';
import { MUSICIAN_TOOL_DISCIPLINE, buildMusicianInitialPrompt } from '../../src/prompts/tool-discipline.js';

describe('tool-discipline prompts', () => {
  it('requires the orchestrator to resolve coordination via NFO tools', () => {
    expect(ORCHESTRATOR_ROLE_PROMPT_V1).toContain('Tool discipline (mandatory):');
    expect(ORCHESTRATOR_ROLE_PROMPT_V1).toContain('Call the corresponding NFO tool in the same turn.');
    expect(ORCHESTRATOR_ROLE_PROMPT_V1).toContain('A prose-only');
  });

  it('requires musicians to use report_done instead of plain text', () => {
    expect(MUSICIAN_ROLE_PROMPT_V1).toContain('Plain-text status reports are');
    expect(MUSICIAN_ROLE_PROMPT_V1).toContain('next action must be `report_done');
    expect(MUSICIAN_ROLE_PROMPT_V1).toContain('Do not end with "done"');
  });

  it('injects the tool contract into the initial musician task prompt', () => {
    const prompt = buildMusicianInitialPrompt('Run the failing test and fix it.');
    expect(prompt).toContain('Run the failing test and fix it.');
    expect(prompt).toContain('NFO operating contract (mandatory):');
    expect(prompt).toContain('instead of replying with a plain-text completion message');
  });

  it('instructs the musician to call report_state during work', () => {
    expect(MUSICIAN_TOOL_DISCIPLINE).toContain('report_state');
  });

  it('mentions report_state in the per-task initial prompt', () => {
    const prompt = buildMusicianInitialPrompt('do the thing');
    expect(prompt).toContain('report_state');
    expect(prompt).toContain('do the thing');
  });
});
