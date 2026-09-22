import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';
import { checkNewPassword, friendlyAuthError, type PasswordErrors } from './passwords';

export function SetNewPassword() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors & { form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = checkNewPassword(password, confirm);
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErrors({ form: friendlyAuthError(error.message) });
    else finishRecovery();
  }

  return (
    <AuthLayout title="Set a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div>
          <label htmlFor="new-password" className="label">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'new-password-err' : undefined}
            className="field"
          />
          {errors.password && (
            <p id="new-password-err" className="mt-1 text-xs text-danger">
              {errors.password}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="new-confirm" className="label">
            Confirm new password
          </label>
          <input
            id="new-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'new-confirm-err' : undefined}
            className="field"
          />
          {errors.confirm && (
            <p id="new-confirm-err" className="mt-1 text-xs text-danger">
              {errors.confirm}
            </p>
          )}
        </div>
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary mt-1 w-full">
          {busy ? 'Please wait…' : 'Save password'}
        </button>
        <button type="button" onClick={finishRecovery} className="btn btn-ghost w-full">
          Cancel
        </button>
      </form>
    </AuthLayout>
  );
}
