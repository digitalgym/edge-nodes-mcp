import type { NodeHandler } from "../../mcp/src/types";

const handler: NodeHandler = async ({ input, credentials }) => {
  const channel = input.channel as string;
  const text = input.text as string;
  const threadTs = input.threadTs as string | undefined;
  const username = input.username as string | undefined;
  const iconEmoji = input.iconEmoji as string | undefined;
  const token = credentials.SLACK_BOT_TOKEN;

  if (!channel || !text) {
    return { success: false, error: "'channel' and 'text' are required" };
  }

  const body: Record<string, unknown> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;
  if (username) body.username = username;
  if (iconEmoji) body.icon_emoji = iconEmoji;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      ok: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };

    if (!data.ok) {
      return { success: false, error: `Slack API error: ${data.error}` };
    }

    return {
      success: true,
      data: {
        ts: data.ts,
        channel: data.channel,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Slack request failed: ${message}` };
  }
};

export default handler;
