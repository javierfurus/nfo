import { describe, it, expect } from 'vitest';
import {
  PERMISSION_LEVELS,
  claudeFlagsForLevel,
  isPermissionLevel,
  type PermissionLevel,
} from '../src/permission.js';

describe('permission levels', () => {
  it('lists all four levels in order from most to least permissive', () => {
    expect(PERMISSION_LEVELS).toEqual(['auto', 'autonomous', 'supervised', 'strict']);
  });

  it('isPermissionLevel rejects unknown strings', () => {
    expect(isPermissionLevel('auto')).toBe(true);
    expect(isPermissionLevel('autonomous')).toBe(true);
    expect(isPermissionLevel('supervised')).toBe(true);
    expect(isPermissionLevel('strict')).toBe(true);
    expect(isPermissionLevel('YOLO')).toBe(false);
    expect(isPermissionLevel('')).toBe(false);
  });

  it('claudeFlagsForLevel returns the right flag list per level', () => {
    expect(claudeFlagsForLevel('auto')).toEqual(['--dangerously-skip-permissions']);
    expect(claudeFlagsForLevel('autonomous')).toEqual(['--permission-mode', 'acceptEdits']);
    expect(claudeFlagsForLevel('supervised')).toEqual(['--permission-mode', 'default']);
    expect(claudeFlagsForLevel('strict')).toEqual(['--permission-mode', 'plan']);
  });
});
