import { createClient } from '@supabase/supabase-js';
const url=(import.meta.env.VITE_SUPABASE_URL||'').trim();
const key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'').trim();
export const configured = /^https:\/\/[^\s/]+(?:\/)?$/.test(url) && !!key && !key.startsWith('sb_secret_');
export const supabase = createClient(configured?url:'https://example.supabase.co',configured?key:'missing-config');
