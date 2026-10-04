import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

const authStorageKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : '';

export function storedUser(): { id: string; email: string } | null {
  try {
    const raw = authStorageKey ? localStorage.getItem(authStorageKey) : null;
    const user = raw ? (JSON.parse(raw) as { user?: { id?: string; email?: string } }).user : undefined;
    return user?.id ? { id: user.id, email: user.email ?? '' } : null;
  } catch {
    return null;
  }
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
