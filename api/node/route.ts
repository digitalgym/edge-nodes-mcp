/**
 * Vercel Edge Function entry point for direct node execution.
 *
 * Route: /api/node?name=<node-name>
 * Accepts POST with JSON body matching the node's input schema.
 * Useful for calling nodes directly (e.g. as webhook endpoints).
 */

import { getNode } from "../../mcp/src/registry.js";
import type { NodeExecutionInput } from "../../mcp/src/types.js";

export const runtime = "edge";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");

  if (!name) {
    return Response.json(
      { success: false, error: "Missing ?name= query parameter" },
      { status: 400 }
    );
  }

  const node = getNode(name);
  if (!node) {
    return Response.json(
      { success: false, error: `Node "${name}" not found` },
      { status: 404 }
    );
  }

  let body: Partial<NodeExecutionInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Resolve credentials from body or env
  const credentials: Record<string, string> = {};
  for (const cred of node.config.credentials) {
    if (body.credentials?.[cred.envVar]) {
      credentials[cred.envVar] = body.credentials[cred.envVar];
    } else {
      const envVal = process.env[cred.envVar];
      if (envVal) credentials[cred.envVar] = envVal;
    }
  }

  try {
    const result = await node.handler({
      input: body.input ?? {},
      credentials,
      previous: body.previous,
    });
    return Response.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
