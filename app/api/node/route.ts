import { NextRequest, NextResponse } from "next/server";
import { getNode } from "@mcp/registry";
import type { NodeExecutionInput } from "@mcp/types";

export async function POST(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Missing ?name= query parameter" },
      { status: 400 }
    );
  }

  const node = getNode(name);
  if (!node) {
    return NextResponse.json(
      { success: false, error: `Node "${name}" not found` },
      { status: 404 }
    );
  }

  let body: Partial<NodeExecutionInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

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
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
