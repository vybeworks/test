import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Service-role client - bypasses RLS entirely. Only ever used inside Edge
 * Functions, never in client code. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * are injected automatically into every Edge Function's environment; they
 * don't need to be set with `supabase secrets set`.
 */
export function supabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}
