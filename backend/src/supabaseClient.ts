import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables');
}

// Data client — always uses the service-role key to bypass RLS.
// IMPORTANT: never call auth.getUser()/auth.setSession() on this client,
// as that mutates the shared client's Authorization header and causes
// subsequent queries to run under a user's RLS context instead of service-role.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Dedicated, isolated client used only for verifying user JWTs.
// Kept separate so token verification never contaminates the data client.
export const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
