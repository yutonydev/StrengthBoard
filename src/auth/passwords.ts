export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordErrors {
  password?: string;
  confirm?: string;
}

export function checkNewPassword(password: string, confirm: string): PasswordErrors {
  const errors: PasswordErrors = {};
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  else if (confirm !== password) errors.confirm = 'Passwords don’t match';
  return errors;
}

export function checkEmail(email: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter a valid email address';
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password';
  if (m.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the link.';
  if (m.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.';
  return message;
}
