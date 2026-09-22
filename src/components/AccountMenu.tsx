import { LogOut, UserRound } from 'lucide-react';
import { Menu } from './Menu';

export function AccountMenu({ email, pending, onSignOut }: { email: string; pending: number; onSignOut: () => void }) {
  function signOut() {
    if (pending > 0) {
      const what = pending === 1 ? '1 change hasn’t' : `${pending} changes haven’t`;
      if (!window.confirm(`${what} uploaded yet and will be lost if you sign out. Sign out anyway?`)) return;
    }
    onSignOut();
  }

  return (
    <Menu
      label="Account"
      trigger={<UserRound size={16} aria-hidden="true" />}
      items={[
        { label: email || 'Signed in', icon: <UserRound size={14} />, onSelect: () => {}, disabled: true },
        { label: 'Sign out', icon: <LogOut size={14} />, onSelect: signOut, separator: true },
      ]}
    />
  );
}
