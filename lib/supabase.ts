import { createClient } from "@supabase/supabase-js";

/** Server-only client using the secret key — bypasses RLS. Every access to
 * it must go through a route that has already checked the session, since
 * this key must never reach the browser. */
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);
