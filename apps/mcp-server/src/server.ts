import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMetaViewMcpServer } from "./mcp/createServer";

async function main(): Promise<void> {
  const server = createMetaViewMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
