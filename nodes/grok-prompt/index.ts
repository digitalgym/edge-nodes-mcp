import type { NodeHandler } from "../../mcp/src/types.js";

const handler: NodeHandler = async ({ input, credentials }) => {
  const prompt = input.prompt as string;
  const system = input.system as string | undefined;
  const model = (input.model as string) || "grok-3-mini";
  const jsonMode = input.jsonMode as boolean | undefined;
  const temperature = (input.temperature as number) ?? 0.7;
  const maxTokens = (input.maxTokens as number) || 1000;
  const apiKey = credentials.XAI_API_KEY;

  if (!prompt) {
    return { success: false, error: "'prompt' is required" };
  }

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Grok API error ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content || "";
    let parsed: unknown = null;

    if (jsonMode) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }
    }

    return {
      success: true,
      data: {
        content,
        parsed,
        model: data.model || model,
        usage: data.usage || null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Grok request failed: ${message}` };
  }
};

export default handler;
