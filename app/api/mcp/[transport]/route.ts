import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@mcp/server";

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
