import { homedir } from 'node:os';
import { join } from 'node:path';

export const STATE_VERSION = 1;
export const STATE_FILENAME = 'state.json';
export const NOTES_DIRNAME = 'notes';
export const LOGS_DIRNAME = 'logs';
export const MESSAGE_LOGS_DIRNAME = 'messages';
export const WORKTREES_DIRNAME = 'worktrees';
export const ARCHIVE_DIRNAME = 'archive';

export const getNFOHome = (): string =>
  (process.env.NFO_HOME && process.env.NFO_HOME !== '')
    ? process.env.NFO_HOME
    : join(homedir(), '.config', 'nfo');

export const getProjectsDir = (): string => join(getNFOHome(), 'projects');
export const getGlobalConfigFile = (): string => join(getNFOHome(), 'config.json');

// Keep backward-compatible aliases (resolved at call time)
export const NFO_HOME = getNFOHome();
export const PROJECTS_DIR = getProjectsDir();
export const GLOBAL_CONFIG_FILE = getGlobalConfigFile();

export const orchestraDir = (projectKey: string): string =>
  join(getProjectsDir(), projectKey);

export const stateFile = (projectKey: string): string =>
  join(orchestraDir(projectKey), STATE_FILENAME);

export const notesDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), NOTES_DIRNAME);

export const logsDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), LOGS_DIRNAME);

export const messageLogsDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), MESSAGE_LOGS_DIRNAME);

export const worktreesDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), WORKTREES_DIRNAME);

export const archiveDir = (projectKey: string): string =>
  join(orchestraDir(projectKey), ARCHIVE_DIRNAME);
