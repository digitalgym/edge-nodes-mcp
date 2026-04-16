import type { NodeHandler } from "../../mcp/src/types";

const handler: NodeHandler = async ({ input, credentials }) => {
  const table = input.table as string;
  const operation = ((input.operation as string) || "select").toLowerCase();
  const data = input.data;
  const filters = (input.filters as string) || "";
  const select = (input.select as string) || "*";
  const limit = (input.limit as number) || 100;
  const order = input.order as string | undefined;
  const supabaseUrl = credentials.SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = credentials.SUPABASE_SERVICE_KEY;

  if (!table) {
    return { success: false, error: "'table' is required" };
  }

  const baseUrl = `${supabaseUrl}/rest/v1/${table}`;
  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "",
  };

  try {
    let url: string;
    let init: RequestInit;

    switch (operation) {
      case "select": {
        const params = new URLSearchParams();
        params.set("select", select);
        if (filters) {
          for (const f of filters.split("&")) {
            const [key, ...rest] = f.split("=");
            params.set(key, rest.join("="));
          }
        }
        if (order) params.set("order", order);
        params.set("limit", String(limit));
        url = `${baseUrl}?${params}`;
        init = { method: "GET", headers };
        break;
      }
      case "insert": {
        if (!data) return { success: false, error: "'data' is required for insert" };
        url = baseUrl;
        headers.Prefer = "return=representation";
        init = { method: "POST", headers, body: JSON.stringify(data) };
        break;
      }
      case "upsert": {
        if (!data) return { success: false, error: "'data' is required for upsert" };
        url = baseUrl;
        headers.Prefer = "return=representation,resolution=merge-duplicates";
        init = { method: "POST", headers, body: JSON.stringify(data) };
        break;
      }
      case "update": {
        if (!data) return { success: false, error: "'data' is required for update" };
        if (!filters) return { success: false, error: "'filters' is required for update (safety: prevents full-table update)" };
        const uParams = new URLSearchParams();
        for (const f of filters.split("&")) {
          const [key, ...rest] = f.split("=");
          uParams.set(key, rest.join("="));
        }
        url = `${baseUrl}?${uParams}`;
        headers.Prefer = "return=representation";
        init = { method: "PATCH", headers, body: JSON.stringify(data) };
        break;
      }
      case "delete": {
        if (!filters) return { success: false, error: "'filters' is required for delete (safety: prevents full-table delete)" };
        const dParams = new URLSearchParams();
        for (const f of filters.split("&")) {
          const [key, ...rest] = f.split("=");
          dParams.set(key, rest.join("="));
        }
        url = `${baseUrl}?${dParams}`;
        headers.Prefer = "return=representation";
        init = { method: "DELETE", headers };
        break;
      }
      default:
        return { success: false, error: `Unknown operation: ${operation}. Use select, insert, update, upsert, or delete.` };
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Supabase ${operation} error ${res.status}: ${errText}` };
    }

    const rows = (await res.json()) as unknown[];
    return {
      success: true,
      data: {
        rows,
        count: Array.isArray(rows) ? rows.length : 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Supabase request failed: ${message}` };
  }
};

export default handler;
