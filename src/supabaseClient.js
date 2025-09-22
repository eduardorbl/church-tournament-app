import { createClient } from '@supabase/supabase-js';

// Initialise the Supabase client using environment variables exposed by Vite.
// The URL and anonymous key will be available at build time when you create
// a `.env` file based on `.env.example` at the project root.  Without valid
// values the application will not be able to connect to Supabase.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);