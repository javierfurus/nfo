import chokidar from 'chokidar';
import { stateFile } from '../config.js';
import { readState } from '../state.js';
import type { OrchestraState } from '../state.types.js';

export type StopWatching = () => Promise<void>;

/**
 * Watch an orchestra's state.json and invoke `onChange` with the parsed state:
 * once immediately, then on every file change. A chokidar watcher handles the
 * common case; a 1s poll fallback covers filesystems without reliable inotify.
 * Reads that fail mid-write (partial JSON) are swallowed — the next event wins.
 */
export async function watchOrchestraState(
  orchestraId: string,
  onChange: (state: OrchestraState) => void,
): Promise<StopWatching> {
  const file = stateFile(orchestraId);

  async function emit(): Promise<void> {
    try {
      const state = await readState(orchestraId);
      if (state) {
        onChange(state);
      }
    } catch {
      // partial write / transient read error — ignore, next tick re-reads
    }
  }

  await emit();

  const watcher = chokidar.watch(file, { ignoreInitial: true });
  watcher.on('change', () => { void emit(); });
  watcher.on('add', () => { void emit(); });

  const poll = setInterval(() => { void emit(); }, 1000);

  return async () => {
    clearInterval(poll);
    await watcher.close();
  };
}
