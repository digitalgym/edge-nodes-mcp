import type { NodeHandler } from "../../mcp/src/types";

function extractPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const handler: NodeHandler = async ({ input }) => {
  const payload = input.payload;
  const headers = (input.headers as Record<string, string>) || {};
  const extractField = input.extract as string | undefined;
  const secret = input.secret as string | undefined;

  if (payload === undefined || payload === null) {
    return { success: false, error: "'payload' is required" };
  }

  // Verify webhook secret if configured
  let verified = true;
  if (secret) {
    const headerSecret =
      headers["x-webhook-secret"] ||
      headers["X-Webhook-Secret"] ||
      headers["authorization"]?.replace(/^Bearer\s+/i, "");
    verified = headerSecret === secret;
  }

  if (secret && !verified) {
    return {
      success: false,
      error: "Webhook secret verification failed",
      data: { verified: false },
    };
  }

  // Extract nested value if path specified
  let extracted: unknown = null;
  if (extractField && typeof payload === "object") {
    extracted = extractPath(payload, extractField);
  }

  return {
    success: true,
    data: {
      payload,
      extracted,
      verified,
    },
  };
};

export default handler;
