import { execa } from 'execa';
import { DASHBOARD_WINDOW_NAME } from '../dashboard.js';
import { createDetachedWindow, respawnPane, setPaneOption } from '../tmux.js';
import { shellQuote } from '../shell-quote.js';

function tuiCommand(orchestraId: string): string {
  const nfoBin = process.argv[1];
  return `${shellQuote(nfoBin)} tui --orchestra-id ${shellQuote(orchestraId)}`;
}

export async function ensureDashboardWindow(
  session: string,
  cwd: string,
  orchestraId: string,
): Promise<void> {
  await removeDashboardWindow(session);
  const paneId = await createDetachedWindow(session, DASHBOARD_WINDOW_NAME, cwd);
  await setPaneOption(paneId, 'remain-on-exit', 'on');
  await respawnPane(paneId, tuiCommand(orchestraId));
}

export async function migrateLegacySidebarPane(session: string): Promise<void> {
  await execa('tmux', ['kill-pane', '-t', `${session}:0.1`], { reject: false });
}

async function removeDashboardWindow(session: string): Promise<void> {
  const { stdout } = await execa('tmux', ['list-windows', '-t', session, '-F', '#{window_name}']);
  const names = stdout.split('\n').map((line) => { return line.trim(); }).filter(Boolean);
  if (!names.includes(DASHBOARD_WINDOW_NAME)) {
    return;
  }
  await execa('tmux', ['kill-window', '-t', `${session}:${DASHBOARD_WINDOW_NAME}`], { reject: false });
}
