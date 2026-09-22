import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { supabase } from '../supabase';
import { AuthLayout } from './AuthLayout';
import { checkEmail, checkNewPassword, friendlyAuthError } from './passwords';

type Mode = 'signIn' | 'signUp' | 'forgot' | 'checkEmail' | 'resetSent';

interface Errors {
  email?: string;
  password?: string;
  confirm?: string;
  form?: string;
}

const TITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  forgot: 'Reset password',
  checkEmail: 'Check your email',
  resetSent: 'Check your email',
};

const SUBMIT: Record<'signIn' | 'signUp' | 'forgot', string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  forgot: 'Send reset link',
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs text-danger">
      {message}
    </p>
  ) : null;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function go(next: Mode) {
    setMode(next);
    setErrors({});
    setPassword('');
    setConfirm('');
  }

  function validate(): Errors {
    const next: Errors = { email: checkEmail(email) };
    if (mode === 'signIn' && !password) next.password = 'Enter your password';
    if (mode === 'signUp') Object.assign(next, checkNewPassword(password, confirm));
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.email || next.password || next.confirm) return;
    setBusy(true);
    try {
      const address = email.trim();
      const redirect = window.location.origin;
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
      } else if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: redirect } });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
        else if (!data.session) go('checkEmail');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: redirect });
        if (error) setErrors({ form: friendlyAuthError(error.message) });
        else go('resetSent');
      }
    } catch (err) {
      setErrors({ form: friendlyAuthError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'checkEmail' || mode === 'resetSent') {
    return (
      <AuthLayout title={TITLES[mode]}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <MailCheck size={20} aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">
            {mode === 'checkEmail'
              ? `We sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`
              : `If an account exists for ${email.trim()}, we sent it a link to reset the password.`}
          </p>
          <button type="button" onClick={() => go('signIn')} className="btn btn-outline mt-1 w-full">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={TITLES[mode]}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="auth-email" className="label">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'auth-email-err' : undefined}
            className="field"
          />
          <FieldError id="auth-email-err" message={errors.email} />
        </div>
        {mode !== 'forgot' && (
          <div>
            <label htmlFor="auth-password" className="label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'auth-password-err' : undefined}
              className="field"
            />
            <FieldError id="auth-password-err" message={errors.password} />
          </div>
        )}
        {mode === 'signUp' && (
          <div>
            <label htmlFor="auth-confirm" className="label">
              Confirm password
            </label>
            <input
              id="auth-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? 'auth-confirm-err' : undefined}
              className="field"
            />
            <FieldError id="auth-confirm-err" message={errors.confirm} />
          </div>
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full">
          {busy ? 'Please wait…' : SUBMIT[mode]}
        </button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted">
        {mode === 'signIn' ? (
          <>
            <button type="button" onClick={() => go('forgot')} className="text-accent-text hover:underline">
              Forgot password?
            </button>
            <p>
              New here?{' '}
              <button type="button" onClick={() => go('signUp')} className="font-medium text-accent-text hover:underline">
                Create an account
              </button>
            </p>
          </>
        ) : (
          <p>
            Already have an account?{' '}
            <button type="button" onClick={() => go('signIn')} className="font-medium text-accent-text hover:underline">
              Sign in
            </button>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
