import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendBatchEmails } from "../_shared/resend.ts";

const CAMPAIGN = "launch";
const SUBJECT = "GRIND is live.";

function buildHtml(ctaUrl: string): string {
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
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">You signed up because you're actually trying to make it. Not just posting and hoping. Actually building something.</p>
                <p style="font-size:24px;line-height:1.3;font-weight:700;color:#12141c;margin:0 0 20px;">GRIND is live.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 20px;">Your rhythm. Your streak. Your real numbers — pulled automatically, not typed in by hand. Your next release, planned out properly instead of winged the week before it drops.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 28px;">This isn't another app that sits on your phone doing nothing. It's the system you've been missing.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="border-radius:10px;background:#e8a33d;">
                      <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#12141c;text-decoration:none;">Get started with GRIND &rarr;</a>
                    </td>
                  </tr>
                </table>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0 0 4px;">You were here before anyone else. Let's get to work.</p>
                <p style="font-size:16px;line-height:1.6;color:#2b2b2b;margin:0;">— GRIND</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #ececec;">
                <p style="font-size:12px;line-height:1.5;color:#8a8a8a;margin:0;">You're getting this because you joined the GRIND waitlist. Reply to this email and you'll be taken off the list.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(ctaUrl: string): string {
  return `You signed up because you're actually trying to make it. Not just posting and hoping. Actually building something.

GRIND is live.

Your rhythm. Your streak. Your real numbers — pulled automatically, not typed in by hand. Your next release, planned out properly instead of winged the week before it drops.

This isn't another app that sits on your phone doing nothing. It's the system you've been missing.

Get started with GRIND: ${ctaUrl}

You were here before anyone else. Let's get to work.

— GRIND

---
You're getting this because you joined the GRIND waitlist. Reply to this email and you'll be taken off the list.`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("LAUNCH_EMAIL_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const from = Deno.env.get("MAIL_FROM_ADDRESS");
  const ctaUrl = Deno.env.get("GET_STARTED_URL");
  if (!from || !ctaUrl) {
    return json({ error: "MAIL_FROM_ADDRESS or GET_STARTED_URL is not set" }, 500);
  }

  let body: { dryRun?: boolean; testEmail?: string } = {};
  try {
    const rawText = await req.text();
    if (rawText) body = JSON.parse(rawText);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const html = buildHtml(ctaUrl);
  const text = buildText(ctaUrl);
  const admin = supabaseAdmin();

  // Test mode: one real email to a single address, bypassing the waitlist
  // and email_sends entirely - for checking the template/deliverability
  // before triggering the real send.
  if (body.testEmail) {
    const result = await sendBatchEmails(from, [{ to: body.testEmail, subject: SUBJECT, html, text }]);
    return json({ mode: "test", ...result });
  }

  const { data: signups, error: fetchError } = await admin.from("waitlist_signups").select("email");
  if (fetchError) return json({ error: fetchError.message }, 500);

  const { data: alreadySent, error: sentError } = await admin
    .from("email_sends")
    .select("recipient_email")
    .eq("campaign", CAMPAIGN);
  if (sentError) return json({ error: sentError.message }, 500);

  const sentSet = new Set((alreadySent ?? []).map((r) => r.recipient_email));
  const candidates = (signups ?? []).map((r) => r.email).filter((email) => !sentSet.has(email));

  if (body.dryRun) {
    return json({
      mode: "dryRun",
      totalOnWaitlist: signups?.length ?? 0,
      alreadySent: sentSet.size,
      wouldSend: candidates.length,
      recipients: candidates,
    });
  }

  if (candidates.length === 0) {
    return json({
      mode: "send",
      totalOnWaitlist: signups?.length ?? 0,
      alreadySent: sentSet.size,
      sent: 0,
      failed: [],
    });
  }

  const { sent, failed } = await sendBatchEmails(
    from,
    candidates.map((email) => ({ to: email, subject: SUBJECT, html, text }))
  );

  if (sent.length > 0) {
    const { error: markError } = await admin
      .from("email_sends")
      .upsert(
        sent.map((email) => ({ recipient_email: email, campaign: CAMPAIGN })),
        { onConflict: "recipient_email,campaign" }
      );
    if (markError) console.error("send-launch-email: failed to record sent state:", markError.message);
  }

  // Any address in `failed` was never marked sent, so re-running this same
  // trigger later will naturally retry just those - no separate retry logic
  // needed, at the cost of not protecting against two truly concurrent
  // triggers racing each other. Fine for a manually-run, one-operator action;
  // don't run the curl command twice in parallel.
  return json({
    mode: "send",
    totalOnWaitlist: signups?.length ?? 0,
    alreadySentBefore: sentSet.size,
    sent: sent.length,
    failed,
  });
});
