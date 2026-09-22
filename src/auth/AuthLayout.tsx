import type { ReactNode } from 'react';
import { Logo } from '../components/Logo';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight text-fg">StrengthBoard</span>
      </div>
      <section aria-labelledby="auth-title" className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-pop">
        <h1 id="auth-title" className="mb-4 text-base font-semibold text-fg">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}
