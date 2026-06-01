import { execa } from 'execa';

export interface AddWorktreeArgs {
  repoRoot: string;
  path: string;
  branch: string;
  baseRef?: string;
}

export async function addWorktree(args: AddWorktreeArgs): Promise<void> {
  const cmdArgs = ['worktree', 'add', '-b', args.branch, args.path];
  if (args.baseRef) {
    cmdArgs.push(args.baseRef);
  }
  await execa('git', cmdArgs, { cwd: args.repoRoot });
}

export interface RemoveWorktreeArgs {
  repoRoot: string;
  path: string;
  force?: boolean;
}

export async function removeWorktree(args: RemoveWorktreeArgs): Promise<void> {
  const cmdArgs = ['worktree', 'remove'];
  if (args.force) {
    cmdArgs.push('--force');
  }
  cmdArgs.push(args.path);
  await execa('git', cmdArgs, { cwd: args.repoRoot, reject: false });
}

export async function worktreeExists(repoRoot: string, path: string): Promise<boolean> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot });
  const lines = stdout.split('\n');
  return lines.some((l) => { return l === `worktree ${path}`; });
}

export async function deleteBranch(repoRoot: string, branch: string): Promise<void> {
  await execa('git', ['branch', '-D', branch], { cwd: repoRoot, reject: false });
}
