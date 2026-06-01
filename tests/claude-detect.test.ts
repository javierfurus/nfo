import { describe, it, expect } from 'vitest';
import { detectClaude } from '../src/claude-detect.js';

describe('detectClaude', () => {
  it('returns a parsed version object when claude is installed', async () => {
    const info = await detectClaude();
    expect(info).toMatchObject({
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      major: expect.any(Number),
      minor: expect.any(Number),
      patch: expect.any(Number),
    });
  });
});
