/**
 * Edge Nodes MCP Server
 *
 * Central control plane that exposes all nodes as MCP tools.
 * Claude connects to this server and can:
 *   - Discover available nodes
 *   - Read node configurations
 *   - Execute individual nodes
 *   - Build workflows from natural language descriptions
 *   - Execute full workflows step-by-step
 *
 * This module exports both:
 *   - registerTools(server) — for use with mcp-handler's createMcpHandler
 *   - createServer()        — for standalone stdio/Docker transport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getNode, listNodeSummaries, getNodeConfigs } from "./registry";
import { executeWorkflow } from "./workflow-engine";
import type { Workflow, WorkflowStep } from "./types";

// Reusable schema fragments (zod v4: z.record needs key + value types)
const stepSchema = z.object({
  id: z.string(),
  node: z.string(),
  input: z.record(z.string(), z.unknown()),
  inputMappings: z.record(z.string(), z.string()).optional(),
  condition: z.string().optional(),
});

const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.array(stepSchema),
  credentials: z.record(z.string(), z.string()).optional(),
  createdAt: z.string(),
});

/**
 * Register all MCP tools on the given server instance.
 * Used by both the Vercel adapter (which creates its own server)
 * and the standalone stdio transport (which uses createServer()).
 */
export function registerTools(server: McpServer): void {
  // ── Tool: list_nodes ────────────────────────────────────────────────────

  server.tool(
    "list_nodes",
    "List all available edge function nodes with their name, description, and category. Use this to discover what nodes are available before building a workflow.",
    async () => {
      const nodes = listNodeSummaries();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(nodes, null, 2) }],
      };
    }
  );

  // ── Tool: get_node_config ───────────────────────────────────────────────

  server.tool(
    "get_node_config",
    "Get the full configuration for a specific node, including its inputs, outputs, and required credentials.",
    { name: z.string() },
    async ({ name }) => {
      const node = getNode(name);
      if (!node) {
        return {
          content: [{ type: "text" as const, text: `Node "${name}" not found. Use list_nodes to see available nodes.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(node.config, null, 2) }],
      };
    }
  );

  // ── Tool: execute_node ──────────────────────────────────────────────────

  server.tool(
    "execute_node",
    "Execute a single edge function node directly. Provide the node name, input parameters, and any credentials. Credentials fall back to server env vars if not provided.",
    {
      name: z.string(),
      input: z.record(z.string(), z.unknown()),
      credentials: z.record(z.string(), z.string()).optional(),
    },
    async ({ name, input, credentials }) => {
      const node = getNode(name);
      if (!node) {
        return {
          content: [{ type: "text" as const, text: `Node "${name}" not found. Use list_nodes to see available nodes.` }],
          isError: true,
        };
      }

      const resolvedCreds: Record<string, string> = {};
      for (const credField of node.config.credentials) {
        const override = credentials?.[credField.envVar];
        if (override) {
          resolvedCreds[credField.envVar] = override;
        } else {
          const envVal = process.env[credField.envVar];
          if (envVal) resolvedCreds[credField.envVar] = envVal;
        }

        if (credField.required && !resolvedCreds[credField.envVar]) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Missing required credential: ${credField.label} (${credField.envVar}). Either provide it in the credentials parameter or set it as an environment variable.`,
              },
            ],
            isError: true,
          };
        }
      }

      try {
        const result = await node.handler({ input, credentials: resolvedCreds });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Execution failed: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: build_workflow ────────────────────────────────────────────────

  server.tool(
    "build_workflow",
    "Build a workflow JSON from a structured description. Provide the workflow name, description, and an ordered list of steps. Each step specifies which node to use and its input configuration. Returns a complete workflow object ready to execute with run_workflow.",
    {
      name: z.string(),
      description: z.string(),
      steps: z.array(stepSchema),
      credentials: z.record(z.string(), z.string()).optional(),
    },
    async ({ name, description, steps, credentials }) => {
      const errors: string[] = [];
      for (const step of steps) {
        if (!getNode(step.node)) {
          errors.push(`Step "${step.id}": node "${step.node}" not found`);
        }
      }
      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Workflow validation failed:\n${errors.join("\n")}\n\nAvailable nodes: ${getNodeConfigs().map((n) => n.name).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const missingCreds: string[] = [];
      for (const step of steps) {
        const node = getNode(step.node)!;
        for (const cred of node.config.credentials) {
          if (cred.required && !credentials?.[cred.envVar] && !process.env[cred.envVar]) {
            const label = `${cred.label} (${cred.envVar})`;
            if (!missingCreds.includes(label)) {
              missingCreds.push(label);
            }
          }
        }
      }

      const workflow: Workflow = {
        id: `wf_${Date.now()}`,
        name,
        description,
        steps: steps as WorkflowStep[],
        credentials,
        createdAt: new Date().toISOString(),
      };

      const response: Record<string, unknown> = { workflow };
      if (missingCreds.length > 0) {
        response.warning = `The following credentials are required but not configured. Provide them in the credentials parameter or set them as environment variables:\n${missingCreds.join("\n")}`;
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // ── Tool: run_workflow ──────────────────────────────────────────────────

  server.tool(
    "run_workflow",
    "Execute a complete workflow step-by-step. Provide a workflow object (as returned by build_workflow). Each step executes sequentially, passing outputs to the next step via inputMappings. Returns detailed results for every step including timing.",
    {
      workflow: workflowSchema,
    },
    async ({ workflow }) => {
      const result = await executeWorkflow(workflow as Workflow);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      };
    }
  );
}

/**
 * Create a standalone McpServer with all tools registered.
 * Used by the stdio transport (Docker, CLI, Claude Desktop).
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "edge-nodes",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}
