import { execa } from 'execa';

export interface ClaudeInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
}

const MIN_MAJOR = 2;
const MIN_MINOR = 1;

export async function detectClaude(): Promise<ClaudeInfo> {
  let stdout: string;
  try {
    const result = await execa('claude', ['--version']);
    stdout = result.stdout;
  } catch (err) {
    throw new Error(
      `Failed to run \`claude --version\`. Is Claude Code installed and on PATH?\nDetails: ${(err as Error).message}`,
    );
  }

  // Match a semver-shaped substring in the output (claude prints e.g. "2.1.128 (Claude Code)").
  const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse Claude Code version from output: ${stdout}`);
  }
  const [, majS, minS, patS] = match;
  const major = Number(majS);
  const minor = Number(minS);
  const patch = Number(patS);

  if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
    throw new Error(
      `NFO requires Claude Code ${MIN_MAJOR}.${MIN_MINOR}.0 or newer, found ${major}.${minor}.${patch}. ` +
      `Run \`npm i -g @anthropic-ai/claude-code\` (or your package manager equivalent) to upgrade.`,
    );
  }

  return { version: `${major}.${minor}.${patch}`, major, minor, patch };
}
