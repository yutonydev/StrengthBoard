import { useEffect, useState } from 'react';
import App from './App';
import { AuthLayout } from './auth/AuthLayout';
import { AuthScreen } from './auth/AuthScreen';
import { useAuth } from './auth/AuthProvider';
import { SetNewPassword } from './auth/SetNewPassword';
import { Splash } from './components/Splash';
import { supabaseConfigured } from './supabase';

const MIN_SPLASH_MS = 900;
const SPLASH_FADE_MS = 300;

function SetupNotice() {
  return (
    <AuthLayout title="Connect Supabase">
      <p className="text-sm text-muted">
        Copy <code className="font-mono text-fg">.env.example</code> to <code className="font-mono text-fg">.env.local</code>, fill in your
        project URL and publishable key, then restart <code className="font-mono text-fg">npm run dev</code>. The README has the full setup
        steps.
      </p>
    </AuthLayout>
  );
}

function useSplash(ready: boolean) {
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const leaving = ready && minDone;

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setGone(true), SPLASH_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return { leaving, gone };
}

export function Root() {
  const { status, user, recovering } = useAuth();
  const { leaving, gone } = useSplash(!supabaseConfigured || status !== 'loading');

  let screen = <AuthScreen />;
  if (!supabaseConfigured) screen = <SetupNotice />;
  else if (status === 'loading') screen = <div className="min-h-dvh" />;
  else if (recovering && user) screen = <SetNewPassword />;
  else if (status === 'signedIn' && user) screen = <App key={user.id} user={user} />;

  return (
    <>
      {screen}
      {!gone && <Splash leaving={leaving} />}
    </>
  );
}
