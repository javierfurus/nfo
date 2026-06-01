import { describe, expect, it } from 'vitest';
import { formatMusicianDonePrompt } from '../../src/orchestrator/report-back.js';

describe('formatMusicianDonePrompt', () => {
  it('requires a tool call instead of a prose acknowledgement', () => {
    const prompt = formatMusicianDonePrompt({
      musicianId: 'mus-007',
      musicianName: 'fixer',
      summary: 'Patched the failing assertion',
      nextSteps: 'Ask me to add one more regression test if needed.',
    });

    expect(prompt).toContain('Resolve this now with an NFO tool call only:');
    expect(prompt).toContain('dismiss_musician');
    expect(prompt).toContain('message_musician');
    expect(prompt).toContain('A plain-text acknowledgement is invalid here.');
  });
});
