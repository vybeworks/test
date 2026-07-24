/**
 * Stateless, HMAC-signed OAuth `state` parameter. Carries the initiating
 * user's id through the redirect to Google and back to our public callback
 * (which has no Supabase session/JWT of its own - it's a plain browser
 * navigation). Signed with OAUTH_STATE_SECRET so it can't be forged, and
 * time-boxed so an intercepted link can't be replayed later.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signState(userId: string): Promise<string> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET");
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");

  const payload = JSON.stringify({ uid: userId, ts: Date.now(), nonce: crypto.randomUUID() });
  const payloadB64 = toBase64Url(encoder.encode(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the user id if the state is validly signed and not expired, else null. */
export async function verifyState(state: string): Promise<string | null> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET");
  if (!secret) return null;

  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(sigB64), encoder.encode(payloadB64));
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (typeof payload.uid !== "string" || typeof payload.ts !== "number") return null;
    if (Date.now() - payload.ts > STATE_TTL_MS) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
