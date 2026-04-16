import type { NodeHandler } from "../../mcp/src/types";

/** Normalise AU phone numbers to E.164 (+61...) */
function normaliseAU(phone: string): string {
  let n = phone.replace(/[\s\-()]/g, "").replace(/[^\d+]/g, "");
  if (n.startsWith("04")) n = "+61" + n.substring(1);
  else if (n.startsWith("614")) n = "+" + n;
  else if (n.startsWith("4") && n.length === 9) n = "+61" + n;
  else if (!n.startsWith("+")) n = "+" + n;
  return n;
}

const handler: NodeHandler = async ({ input, credentials }) => {
  const rawTo = input.to as string;
  const body = input.body as string;
  const accountSid = credentials.TWILIO_ACCOUNT_SID;
  const authToken = credentials.TWILIO_AUTH_TOKEN;
  const from = (input.from as string) || credentials.TWILIO_FROM_NUMBER;

  if (!rawTo || !body) {
    return { success: false, error: "'to' and 'body' are required" };
  }

  const to = normaliseAU(rawTo);

  try {
    const form = new URLSearchParams();
    form.set("From", from);
    form.set("To", to);
    form.set("Body", body);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      }
    );

    const result = (await res.json()) as {
      sid?: string;
      status?: string;
      error_code?: number;
      message?: string;
    };

    if (!res.ok) {
      return {
        success: false,
        error: `Twilio error ${result.error_code}: ${result.message}`,
        data: { status: res.status, to },
      };
    }

    return {
      success: true,
      data: {
        sid: result.sid,
        status: result.status,
        to,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Twilio request failed: ${message}` };
  }
};

export default handler;
