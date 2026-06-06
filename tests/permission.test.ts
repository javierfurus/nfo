import { describe, it, expect } from 'vitest';
import {
  PERMISSION_LEVELS,
  claudeFlagsForLevel,
  effectiveLevelForModel,
  isPermissionLevel,
  type PermissionLevel,
} from '../src/permission.js';

describe('permission levels', () => {
  it('lists all five levels in order from most to least permissive', () => {
    expect(PERMISSION_LEVELS).toEqual([
      'dangerouslySkipPermissions',
      'auto',
      'acceptEdits',
      'supervised',
      'strict',
    ]);
  });

  it('isPermissionLevel rejects unknown strings', () => {
    expect(isPermissionLevel('dangerouslySkipPermissions')).toBe(true);
    expect(isPermissionLevel('auto')).toBe(true);
    expect(isPermissionLevel('acceptEdits')).toBe(true);
    expect(isPermissionLevel('supervised')).toBe(true);
    expect(isPermissionLevel('strict')).toBe(true);
    expect(isPermissionLevel('YOLO')).toBe(false);
    expect(isPermissionLevel('')).toBe(false);
  });

  it('claudeFlagsForLevel returns the right flag list per level', () => {
    expect(claudeFlagsForLevel('dangerouslySkipPermissions')).toEqual([
      '--dangerously-skip-permissions',
    ]);
    expect(claudeFlagsForLevel('auto')).toEqual(['--permission-mode', 'auto']);
    expect(claudeFlagsForLevel('acceptEdits')).toEqual(['--permission-mode', 'acceptEdits']);
    expect(claudeFlagsForLevel('supervised')).toEqual(['--permission-mode', 'default']);
    expect(claudeFlagsForLevel('strict')).toEqual(['--permission-mode', 'plan']);
  });
});

describe('effectiveLevelForModel', () => {
  it('substitutes dangerouslySkipPermissions when haiku is in auto mode', () => {
    expect(effectiveLevelForModel('auto', 'haiku')).toBe('dangerouslySkipPermissions');
  });

  it('keeps supervised unchanged for haiku', () => {
    expect(effectiveLevelForModel('supervised', 'haiku')).toBe('supervised');
  });

  it('keeps dangerouslySkipPermissions unchanged for haiku', () => {
    expect(effectiveLevelForModel('dangerouslySkipPermissions', 'haiku')).toBe('dangerouslySkipPermissions');
  });

  it('keeps auto unchanged for sonnet', () => {
    expect(effectiveLevelForModel('auto', 'sonnet')).toBe('auto');
  });

  it('keeps auto unchanged when model is undefined', () => {
    expect(effectiveLevelForModel('auto', undefined)).toBe('auto');
  });
});
