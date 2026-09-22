import App from './App';
import { AuthLayout } from './auth/AuthLayout';
import { AuthScreen } from './auth/AuthScreen';
import { useAuth } from './auth/AuthProvider';
import { SetNewPassword } from './auth/SetNewPassword';
import { Logo } from './components/Logo';
import { supabaseConfigured } from './supabase';

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

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Logo />
      <span className="sr-only">Loading</span>
    </main>
  );
}

export function Root() {
  const { status, user, recovering } = useAuth();
  if (!supabaseConfigured) return <SetupNotice />;
  if (status === 'loading') return <Splash />;
  if (recovering && user) return <SetNewPassword />;
  if (status !== 'signedIn' || !user) return <AuthScreen />;
  return <App key={user.id} user={user} />;
}
