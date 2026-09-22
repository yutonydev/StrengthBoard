import { Trophy } from 'lucide-react';

export function PrBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-[18px] items-center gap-0.5 rounded bg-pr-soft px-1 align-middle font-sans text-[10px] leading-none font-semibold tracking-wide text-pr ${className}`}
    >
      <Trophy size={10} strokeWidth={2.5} aria-hidden="true" />
      PR
    </span>
  );
}
