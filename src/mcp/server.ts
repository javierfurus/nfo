import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NFO_TOOLS } from "./tool-defs.js";
import { dispatch } from "./handlers.js";

export interface RunServerOptions {
  orchestraId: string;
  callerMusicianId?: string;
}

export async function runServer(opts: RunServerOptions): Promise<void> {
  const server = new Server(
    { name: "nfo-mcp", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: NFO_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatch(
        opts.orchestraId,
        name,
        (args ?? {}) as Record<string, unknown>,
        {
          callerMusicianId: opts.callerMusicianId,
        },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
