import { render } from "ink";
import { App } from "../tui/components/App.js";
import { readState } from "../state.js";

export interface RunTuiOptions {
  orchestraId: string;
  version: string;
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const instance = render(
    <App orchestraId={opts.orchestraId} version={opts.version} />,
    {
      exitOnCtrlC: false,
    },
  );
  await instance.waitUntilExit();
}
