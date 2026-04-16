/**
 * Vercel entry point for the MCP server.
 *
 * Handles both SSE and Streamable HTTP transports via mcp-handler.
 * Routes: /api/mcp/sse, /api/mcp/mcp (streamable HTTP)
 */

import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../../../mcp/src/server.js";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "edge-nodes", version: "1.0.0" },
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
