import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
