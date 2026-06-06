import type { SubagentModel } from './state.types.js';

export const PERMISSION_LEVELS = ['dangerouslySkipPermissions', 'auto', 'acceptEdits', 'supervised', 'strict'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export function isPermissionLevel(s: string): s is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(s);
}

export function claudeFlagsForLevel(level: PermissionLevel): string[] {
  switch (level) {
    case 'dangerouslySkipPermissions':
      return ['--dangerously-skip-permissions'];
    case 'auto':
      return ['--permission-mode', 'auto'];
    case 'acceptEdits':
      return ['--permission-mode', 'acceptEdits'];
    case 'supervised':
      return ['--permission-mode', 'default'];
    case 'strict':
      return ['--permission-mode', 'plan'];
  }
}

export function effectiveLevelForModel(level: PermissionLevel, model: SubagentModel | undefined): PermissionLevel {
  if (model === 'haiku' && level === 'auto') { return 'dangerouslySkipPermissions'; }
  return level;
}

export const DANGEROUSLY_SKIP_PERMISSIONS_CONFIRM_PHRASE = 'I understand';

export const DANGEROUSLY_SKIP_PERMISSIONS_WARNING = `⚠ "Dangerously skip permissions" mode disables all permission checks.
Musicians can execute arbitrary shell commands, modify files anywhere on
this system, and access the network without asking. Worktrees limit but
do not contain risky operations. Use this only in trusted sandboxes or
when you accept these risks.
Type "${DANGEROUSLY_SKIP_PERMISSIONS_CONFIRM_PHRASE}" to continue.`;
