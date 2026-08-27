import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Never crash the entire React tree when environment variables are missing.
// The app renders a setup/error state instead of becoming a white page.
const url = supabaseUrl?.trim() || 'https://placeholder.supabase.co';
const key = supabaseAnonKey?.trim() || 'placeholder-anon-key';

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export const supabaseConfigured = Boolean(
  supabaseUrl?.trim() &&
  supabaseAnonKey?.trim() &&
  !supabaseUrl.includes('placeholder.supabase.co')
);

if (typeof window !== 'undefined') {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}
