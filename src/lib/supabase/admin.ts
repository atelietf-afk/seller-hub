import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com service role: ignora o RLS. Use só em webhooks, cron e sincronização,
// sempre filtrando pela conta certa.
let admin: SupabaseClient | undefined;

export function adminClient(): SupabaseClient {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
