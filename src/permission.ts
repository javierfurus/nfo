export const PERMISSION_LEVELS = ['auto', 'autonomous', 'supervised', 'strict'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export function isPermissionLevel(s: string): s is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(s);
}

export function claudeFlagsForLevel(level: PermissionLevel): string[] {
  switch (level) {
    case 'auto':
      // Spec §5.2 + §12.2 open question: exact bypass flag is `--dangerously-skip-permissions`
      // in current Claude Code releases. If a future release renames it, update here.
      return ['--dangerously-skip-permissions'];
    case 'autonomous':
      return ['--permission-mode', 'acceptEdits'];
    case 'supervised':
      return ['--permission-mode', 'default'];
    case 'strict':
      return ['--permission-mode', 'plan'];
  }
}

export const AUTO_CONFIRM_PHRASE = 'I understand';

export const AUTO_WARNING = `⚠ AUTO mode disables all permission checks.
Musicians can execute arbitrary shell commands, modify files anywhere on
this system, and access the network without asking. Worktrees limit but
do not contain risky operations. Use this only in trusted sandboxes or
when you accept these risks.
Type "${AUTO_CONFIRM_PHRASE}" to continue.`;
