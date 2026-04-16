/**
 * Stdio transport entry point — for Docker, CLI, and Claude Desktop.
 *
 * Run with: node --loader tsx mcp/src/stdio.ts
 * Or via Docker: docker run -i edge-nodes-mcp
 *
 * This connects the MCP server to stdin/stdout so Claude Desktop,
 * Cursor, or any MCP client can communicate over the stdio transport.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Edge Nodes MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
