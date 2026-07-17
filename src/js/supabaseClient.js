import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail fast on misconfiguration: a missing URL/key otherwise yields a client
// that throws opaque errors on the first request, leaving the app silently
// broken. Throwing here surfaces the real cause immediately.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables: set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
