import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function createSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
