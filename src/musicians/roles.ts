export type MusicianRole = "explorer" | "coder";

export const ROLE_TOOLSETS: Record<MusicianRole, string[] | undefined> = {
  explorer: ["Read", "Grep", "Glob", "WebSearch", "WebFetch", "EnterWorktree", "ExitWorktree"],
  coder: undefined,
};

// Resolution: explicit allowed_tools wins; else derive from role; else undefined.
export function resolveAllowedTools(
  explicitTools: string[] | undefined,
  role: MusicianRole | undefined,
): string[] | undefined {
  if (explicitTools !== undefined) {
    return explicitTools;
  }
  if (role !== undefined) {
    return ROLE_TOOLSETS[role];
  }
  return undefined;
}
