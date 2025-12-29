// services/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Load Supabase URL and Key from environment variables
// In a Vite project, environment variables prefixed with VITE_ are exposed to your client-side code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing from environment variables.");
  throw new Error("Supabase URL or Anon Key is missing. Please check your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// You can add more Supabase related functions here if needed.
