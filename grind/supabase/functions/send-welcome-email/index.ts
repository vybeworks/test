import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendBatchEmails } from "../_shared/resend.ts";

const CAMPAIGN = "welcome";
const SUBJECT = "You're on the list.";

function buildHtml(): string {
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
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">You're in. When GRIND launches, you'll be one of the first to know — before anyone else.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 4px;">In the meantime: follow along, keep grinding, and we'll see you soon.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:20px 0 0;">— GRIND</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(): string {
  return `You're in. When GRIND launches, you'll be one of the first to know — before anyone else. In the meantime: follow along, keep grinding, and we'll see you soon.

— GRIND`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("WELCOME_EMAIL_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const from = Deno.env.get("MAIL_FROM_ADDRESS");
  if (!from) return json({ error: "MAIL_FROM_ADDRESS is not set" }, 500);

  let body: { email?: string } = {};
  try {
    const rawText = await req.text();
    if (rawText) body = JSON.parse(rawText);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!body.email) return json({ error: "email is required" }, 400);

  const admin = supabaseAdmin();

  // Guards against the (unlikely, but cheap to rule out) case of the trigger
  // or pg_net firing more than once for the same signup - the table's own
  // unique constraint on email already prevents duplicate rows, so this is
  // a belt-and-suspenders check, not the primary defense.
  const { data: existing } = await admin
    .from("email_sends")
    .select("recipient_email")
    .eq("recipient_email", body.email)
    .eq("campaign", CAMPAIGN)
    .maybeSingle();
  if (existing) return json({ skipped: true, reason: "already sent" });

  const result = await sendBatchEmails(from, [{ to: body.email, subject: SUBJECT, html: buildHtml(), text: buildText() }]);

  if (result.sent.length > 0) {
    await admin.from("email_sends").upsert(
      { recipient_email: body.email, campaign: CAMPAIGN },
      { onConflict: "recipient_email,campaign" }
    );
  }

  return json(result);
});
