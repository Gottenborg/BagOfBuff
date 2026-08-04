import { createClient } from "@supabase/supabase-js";

// The anon key is a public client credential (safe to ship). Fallbacks keep
// createClient from throwing when env is unset (e.g. during the SPA shell
// prerender); auth calls simply fail until real values are provided.
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";

export const supabase = createClient(url, anonKey);
