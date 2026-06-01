import { execa } from 'execa';
import { DASHBOARD_WINDOW_NAME } from './dashboard.js';

const NFO_SESSION_MATCH = '#{m:^nfo-,#{session_name}}';
const EMBED_SESSION_SUFFIX = '-embed';
const REQUIRED_TERMINAL_FEATURES = [
  'xterm*:extkeys',
  'screen*:extkeys',
  'tmux*:extkeys',
];

export function sessionName(projectKey: string): string {
  return `nfo-${projectKey}`;
}

export function embeddedSessionName(projectKey: string): string {
  return `${sessionName(projectKey)}${EMBED_SESSION_SUFFIX}`;
}

export async function sessionExists(name: string): Promise<boolean> {
  const result = await execa('tmux', ['has-session', '-t', name], { reject: false });
  return result.exitCode === 0;
}

export async function createDetachedSession(
  name: string,
  cwd: string,
  width = 220,
  height = 50,
): Promise<void> {
  await execa('tmux', ['new-session', '-d', '-s', name, '-c', cwd, '-x', String(width), '-y', String(height)]);
}

export async function createDetachedWindow(
  session: string,
  windowName: string,
  cwd: string,
  command?: string,
): Promise<string> {
  const args = [
    'new-window',
    '-t',
    session,
    '-n',
    windowName,
    '-c',
    cwd,
    '-d',
    '-P',
    '-F',
    '#{pane_id}',
  ];
  if (command) {
    args.push(command);
  }
  const { stdout } = await execa('tmux', args);
  return stdout.trim();
}

export async function killSession(name: string): Promise<void> {
  await execa('tmux', ['kill-session', '-t', name], { reject: false });
}

export async function createLinkedSession(
  sourceSession: string,
  linkedSession: string,
  cwd: string,
): Promise<void> {
  await execa('tmux', ['new-session', '-d', '-t', sourceSession, '-s', linkedSession, '-c', cwd]);
}

export async function ensureEmbeddedSession(
  sourceSession: string,
  linkedSession: string,
  cwd: string,
): Promise<void> {
  if (!(await sessionExists(linkedSession))) {
    await createLinkedSession(sourceSession, linkedSession, cwd);
  }
  await ensureNfoSessionUi(linkedSession);
  await selectWindow(linkedSession, '0');
}

export async function attachSession(name: string): Promise<void> {
  // Inherits stdio so the user's terminal becomes the tmux client.
  await execa('tmux', ['attach-session', '-t', name], { stdio: 'inherit' });
}

export async function detachCurrentClient(): Promise<void> {
  await execa('tmux', ['detach-client']);
}

export async function splitWindowHorizontal(
  target: string,
  columns: number,
  command?: string,
): Promise<void> {
  // Use -l (absolute column count) rather than -p (percent) because percent
  // requires an attached client with a known terminal size.
  const args = ['split-window', '-h', '-l', String(columns), '-t', target];
  if (command) args.push(command);
  await execa('tmux', args);
}

export async function sendKeys(target: string, text: string, withEnter: boolean): Promise<void> {
  // Use -l (literal) to avoid keystroke interpretation.
  await execa('tmux', ['send-keys', '-l', '-t', target, '--', text]);
  if (withEnter) {
    await execa('tmux', ['send-keys', '-t', target, 'Enter']);
  }
}

export async function respawnPane(target: string, command: string): Promise<void> {
  await execa('tmux', ['respawn-pane', '-k', '-t', target, command]);
}

export async function capturePane(target: string, lines: number): Promise<string> {
  const { stdout } = await execa('tmux', [
    'capture-pane',
    '-p',
    '-t',
    target,
    '-S',
    `-${lines}`,
  ]);
  return stdout;
}

export async function captureVisiblePane(target: string): Promise<string> {
  const { stdout } = await execa('tmux', [
    'capture-pane',
    '-p',
    '-N',
    '-t',
    target,
    '-S',
    '0',
    '-E',
    '-',
  ]);
  return stdout;
}

export async function setSessionOption(name: string, option: string, value: string): Promise<void> {
  await execa('tmux', ['set-option', '-t', name, option, value]);
}

export async function setPaneOption(target: string, option: string, value: string): Promise<void> {
  await execa('tmux', ['set-option', '-p', '-t', target, option, value]);
}

function parseArrayOptionValue(line: string, option: string): string {
  return line.replace(new RegExp(`^${option}\\[\\d+\\]\\s+`, 'u'), '');
}

async function ensureSessionTerminalFeatures(
  name: string,
  features: string[],
): Promise<void> {
  const { stdout } = await execa('tmux', ['show-options', '-t', name, 'terminal-features']);
  const configured = new Set(
    stdout
      .split('\n')
      .map((line) => { return line.trim(); })
      .filter((line) => { return line.length > 0; })
      .map((line) => { return parseArrayOptionValue(line, 'terminal-features'); }),
  );

  for (const feature of features) {
    if (configured.has(feature)) {
      continue;
    }
    await execa('tmux', ['set-option', '-as', '-t', name, 'terminal-features', `,${feature}`]);
  }
}

async function getRootBindingLine(key: string): Promise<string | null> {
  const { stdout } = await execa('tmux', ['list-keys', '-T', 'root']);
  const line = stdout
    .split('\n')
    .map((entry) => { return entry.trim(); })
    .find((entry) => { return entry.startsWith(`bind-key -T root ${key} `); });
  return line ?? null;
}

async function ensureRootKeyBinding(
  key: string,
  nfoCommand: string,
): Promise<void> {
  const existing = await getRootBindingLine(key);
  if (existing && !existing.includes(NFO_SESSION_MATCH)) {
    // Respect user-defined bindings that are not NFO-managed.
    return;
  }
  await execa('tmux', [
    'bind-key',
    '-n',
    key,
    'if-shell',
    '-F',
    NFO_SESSION_MATCH,
    nfoCommand,
    `send-keys ${key}`,
  ]);
}

export async function ensureNfoNavigationBindings(): Promise<void> {
  await ensureRootKeyBinding('F6', `select-window -t :${DASHBOARD_WINDOW_NAME}`);
  await ensureRootKeyBinding('F7', 'select-window -t :0');
}

export async function ensureNfoSessionUi(name: string): Promise<void> {
  await setSessionOption(name, 'mouse', 'on');
  await setSessionOption(name, 'status', 'off');
  await setSessionOption(name, 'extended-keys', 'on');
  await ensureSessionTerminalFeatures(name, REQUIRED_TERMINAL_FEATURES);
  await ensureNfoNavigationBindings();
}

export async function selectWindow(name: string, windowTarget: string): Promise<void> {
  await execa('tmux', ['select-window', '-t', `${name}:${windowTarget}`]);
}

export async function selectPane(target: string): Promise<void> {
  await execa('tmux', ['select-pane', '-t', target]);
}
