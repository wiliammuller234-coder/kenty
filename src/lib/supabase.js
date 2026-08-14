import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';

// A real Supabase Auth session (established via verifyOtp() after our own Telegram
// code check succeeds — see checkPendingCode in db.js) is what makes the RLS
// policies' auth.jwt() ->> 'phone' checks work. Nothing custom needed here — the
// client's built-in session handling persists it and attaches it to every request.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
