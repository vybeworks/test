import { sendBatchEmails } from "../_shared/resend.ts";

const CATEGORY_LABEL: Record<string, string> = {
  verse_feature: "Verse / Feature",
  cover_swap: "Cover Swap",
  challenge_partner: "Challenge Partner",
  production_swap: "Production Swap",
  feedback_exchange: "Feedback Exchange",
  other: "Other",
};

interface ReportPayload {
  postId?: string;
  postTitle?: string;
  postCategory?: string;
  posterEmail?: string;
  reporterEmail?: string;
  reason?: string | null;
}

function buildText(p: ReportPayload): string {
  return `A Collab Board post was just reported.

Post: ${p.postTitle ?? "(untitled)"}
Category: ${p.postCategory ? CATEGORY_LABEL[p.postCategory] ?? p.postCategory : "unknown"}
Post ID: ${p.postId ?? "unknown"}
Posted by: ${p.posterEmail ?? "unknown"}
Reported by: ${p.reporterEmail ?? "unknown"}
Reason: ${p.reason?.trim() || "(no reason given)"}`;
}

function buildHtml(p: ReportPayload): string {
  const text = buildText(p).replace(/\n/g, "<br>");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:40px 32px;">
                <div style="font-weight:700;letter-spacing:0.15em;text-transform:uppercase;font-size:14px;color:#C77B2E;margin-bottom:24px;">GRIND</div>
                <p style="font-size:15px;line-height:1.7;color:#2b2b2b;margin:0;">${text}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("COLLAB_REPORT_EMAIL_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const from = Deno.env.get("MAIL_FROM_ADDRESS");
  if (!from) return json({ error: "MAIL_FROM_ADDRESS is not set" }, 500);

  let body: ReportPayload = {};
  try {
    const rawText = await req.text();
    if (rawText) body = JSON.parse(rawText);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  // Reports go to the same address GRIND sends from - an admin inbox, not
  // a user-facing send, so from/to being the same address is intentional.
  const result = await sendBatchEmails(from, [
    { to: from, subject: `Collab Board report: ${body.postTitle ?? "untitled post"}`, html: buildHtml(body), text: buildText(body) },
  ]);
  return json(result);
});
