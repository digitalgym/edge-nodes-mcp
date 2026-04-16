import type { NodeHandler } from "../../mcp/src/types";

const handler: NodeHandler = async ({ input, credentials }) => {
  const webhookUrl = input.webhookUrl as string | undefined;
  const channelId = input.channelId as string | undefined;
  const content = input.content as string;
  const username = input.username as string | undefined;
  const embeds = input.embeds as unknown[] | undefined;
  const botToken = credentials.DISCORD_BOT_TOKEN;

  if (!content) {
    return { success: false, error: "'content' is required" };
  }

  if (!webhookUrl && !channelId) {
    return { success: false, error: "Either 'webhookUrl' or 'channelId' is required" };
  }

  const body: Record<string, unknown> = { content };
  if (username) body.username = username;
  if (embeds?.length) body.embeds = embeds;

  try {
    // Webhook mode — simplest, no bot token needed
    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Discord webhook error ${res.status}: ${errText}` };
      }

      return { success: true, data: { sent: true } };
    }

    // Bot API mode
    if (!botToken) {
      return { success: false, error: "DISCORD_BOT_TOKEN credential required when using channelId" };
    }

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Discord API error ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as { id?: string };
    return {
      success: true,
      data: { id: data.id, sent: true },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Discord request failed: ${message}` };
  }
};

export default handler;
