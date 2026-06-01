import { describe, it, expect } from 'vitest';
import { projectKeyFromPath } from '../src/project-key.js';

describe('projectKeyFromPath', () => {
  it('produces a stable key for a given absolute path', () => {
    const key1 = projectKeyFromPath('/home/user/projects/myrepo');
    const key2 = projectKeyFromPath('/home/user/projects/myrepo');
    expect(key1).toBe(key2);
  });

  it('includes the basename as a readable suffix', () => {
    const key = projectKeyFromPath('/home/user/projects/myrepo');
    expect(key.endsWith('-myrepo')).toBe(true);
  });

  it('produces a 10-char sha1 prefix', () => {
    const key = projectKeyFromPath('/home/user/projects/myrepo');
    const prefix = key.split('-')[0];
    expect(prefix).toHaveLength(10);
    expect(prefix).toMatch(/^[0-9a-f]{10}$/);
  });

  it('produces different keys for different paths', () => {
    const a = projectKeyFromPath('/home/user/projects/foo');
    const b = projectKeyFromPath('/home/user/projects/bar');
    expect(a).not.toBe(b);
  });

  it('sanitizes non-alphanumeric basename characters', () => {
    const key = projectKeyFromPath('/tmp/my repo with spaces');
    expect(key).toMatch(/^[0-9a-f]{10}-[a-z0-9-]+$/);
  });
});
