import { sendBatchEmails } from "../_shared/resend.ts";

const SUBJECT = "Your GRIND password was changed";
const SUPPORT_EMAIL = "grind@joingrindapp.com";

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
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">Your GRIND account password was just changed.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">If this was you, no action needed.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">If you didn't make this change, reset your password immediately and reach out to us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#C77B2E;">${SUPPORT_EMAIL}</a>.</p>
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
  return `Your GRIND account password was just changed.

If this was you, no action needed.

If you didn't make this change, reset your password immediately and reach out to us at ${SUPPORT_EMAIL}.

— GRIND`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("PASSWORD_CHANGED_EMAIL_SECRET")}`;
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

  const result = await sendBatchEmails(from, [{ to: body.email, subject: SUBJECT, html: buildHtml(), text: buildText() }]);
  return json(result);
});
