import { runServer } from '../mcp/server.js';
import { readState } from '../state.js';

export interface McpServerCliOptions {
  orchestraId: string;
  callerMusicianId?: string;
}

export async function runMcpServerCli(opts: McpServerCliOptions): Promise<void> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  await runServer({
    orchestraId: opts.orchestraId,
    callerMusicianId: opts.callerMusicianId,
  });
}
