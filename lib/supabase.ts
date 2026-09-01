import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only client using the secret key — bypasses RLS. Every access to
 * it must go through a route that has already checked the session, since
 * this key must never reach the browser.
 *
 * Lazily constructed: throwing here would happen at module-import time,
 * which would break /api/chat (imported transitively for memory + skills)
 * for every user, including anonymous ones, if Supabase isn't configured
 * in a given environment. Deferring the throw to first actual use means it
 * surfaces inside the try/catch blocks that already guard those calls,
 * instead of crashing chat outright. */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY missing)."
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    // Bind methods to the real client — calling through the proxy would
    // otherwise pass the proxy itself as `this`, breaking supabase-js's
    // internal state access.
    return typeof value === "function" ? value.bind(real) : value;
  },
});
