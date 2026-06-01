import { execa } from 'execa';

export interface NotifyOptions {
  pendingCount: number;
  platform?: NodeJS.Platform;
  bell?: (text: string) => void;
  spawn?: (bin: string, args: string[]) => Promise<unknown>;
}

function defaultBell(text: string): void {
  process.stdout.write(text);
}

async function defaultSpawn(bin: string, args: string[]): Promise<unknown> {
  return execa(bin, args);
}

function pluralise(count: number): string {
  if (count === 1) {
    return '1 musician awaiting permission';
  }
  return `${count} musicians awaiting permission`;
}

/**
 * Fire a single notification: ring the terminal bell and (best-effort) spawn
 * the platform's desktop notifier. All errors are swallowed — a missing
 * notify-send / osascript / etc. must not break the orchestra.
 */
export async function notifyAwaitingPermission(opts: NotifyOptions): Promise<void> {
  const bell = opts.bell ?? defaultBell;
  const spawn = opts.spawn ?? defaultSpawn;
  const platform = opts.platform ?? process.platform;
  const message = pluralise(opts.pendingCount);

  try {
    bell('\x07');
  } catch {
    // Swallow — a broken stdout sink should never abort.
  }

  if (platform === 'linux') {
    try {
      await spawn('notify-send', ['NFO', message]);
    } catch {
      // notify-send may not be installed — best-effort only.
    }
    return;
  }

  if (platform === 'darwin') {
    const script = `display notification "${message}" with title "NFO"`;
    try {
      await spawn('osascript', ['-e', script]);
    } catch {
      // osascript should exist on macOS but swallow defensively.
    }
    return;
  }

  // Unknown platform (win32, freebsd, etc.) — bell-only.
}
