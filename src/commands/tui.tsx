import { render } from 'ink';
import { App } from '../tui/App.js';
import { readState } from '../state.js';

export interface RunTuiOptions {
  orchestraId: string;
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const instance = render(<App orchestraId={opts.orchestraId} />, { exitOnCtrlC: false });
  await instance.waitUntilExit();
}
