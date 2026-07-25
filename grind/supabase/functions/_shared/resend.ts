/**
 * Thin wrapper around Resend's batch send API - shared so future email
 * campaigns (newsletters, promos) can reuse it, not just the launch email.
 * https://resend.com/docs/api-reference/emails/send-batch-emails
 */

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100; // Resend's own per-request cap

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface BatchSendResult {
  sent: string[];
  failed: { to: string; error: string }[];
}

/**
 * Sends each message as its own fully separate email (recipients never see
 * each other's addresses). "sent" means Resend accepted it for delivery,
 * not that it was confirmed delivered - bounces/complaints happen
 * asynchronously outside what this call can observe.
 */
export async function sendBatchEmails(from: string, messages: EmailMessage[]): Promise<BatchSendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const sent: string[] = [];
  const failed: { to: string; error: string }[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const resp = await fetch(RESEND_BATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        batch.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }))
      ),
    });

    if (!resp.ok) {
      // The whole batch request failed (e.g. auth, malformed payload) -
      // every address in it is unresolved, not confirmed either way.
      const errorText = await resp.text();
      for (const m of batch) failed.push({ to: m.to, error: `batch request failed: ${errorText}` });
      continue;
    }

    const json = await resp.json();
    const results: any[] = json.data ?? json ?? [];
    batch.forEach((m, idx) => {
      const result = results[idx];
      if (result?.id) sent.push(m.to);
      else failed.push({ to: m.to, error: JSON.stringify(result?.error ?? result ?? "unknown response shape") });
    });
  }

  return { sent, failed };
}
