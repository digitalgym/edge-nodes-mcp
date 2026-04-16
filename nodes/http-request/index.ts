import type { NodeHandler } from "../../mcp/src/types.js";

const handler: NodeHandler = async ({ input }) => {
  const url = input.url as string;
  const method = ((input.method as string) || "GET").toUpperCase();
  const headers = (input.headers as Record<string, string>) || {};
  const body = input.body;
  const timeout = (input.timeout as number) || 10000;

  if (!url) {
    return { success: false, error: "url is required" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      signal: controller.signal,
    };

    if (body && !["GET", "HEAD"].includes(method)) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const res = await fetch(url, init);
    clearTimeout(timer);

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });

    let responseBody: unknown;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseBody = await res.json();
    } else {
      responseBody = await res.text();
    }

    return {
      success: true,
      data: {
        status: res.status,
        headers: responseHeaders,
        body: responseBody,
        ok: res.ok,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `HTTP request failed: ${message}` };
  }
};

export default handler;
