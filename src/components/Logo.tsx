export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--lb-surface-3)" />
      <path d="M5 22l6-7 5 4 11-11" fill="none" stroke="var(--lb-accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
