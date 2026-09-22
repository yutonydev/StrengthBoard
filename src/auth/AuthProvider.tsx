import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  recovering: boolean;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? 'loading' : 'signedOut');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const apply = (session: Session | null) => {
      const next = session?.user;
      setUser((prev) => {
        if (!next) return null;
        const email = next.email ?? '';
        return prev && prev.id === next.id && prev.email === email ? prev : { id: next.id, email };
      });
      setStatus(next ? 'signedIn' : 'signedOut');
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      apply(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, recovering, finishRecovery: () => setRecovering(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
