import { render } from "ink";
import { App } from "../tui/components/App.js";
import { readState } from "../state.js";
import { killSession, embeddedSessionName } from "../tmux.js";

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
      alternateScreen: true,
    },
  );

  async function teardown(): Promise<void> {
    await killSession(embeddedSessionName(opts.orchestraId));
  }

  const onSignal = (): void => {
    instance.unmount();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await instance.waitUntilExit();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await teardown();
  }
}
