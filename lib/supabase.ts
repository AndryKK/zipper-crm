import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client — safe to use in Client Components ('use client')
// Uses anon key, respects Row Level Security
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);

// Server client — use ONLY in Server Components, Route Handlers, Server Actions
// Uses service role key, bypasses Row Level Security
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
