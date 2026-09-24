export function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash ${leaving ? 'splash-leaving' : ''}`} role="status" aria-live="polite" aria-busy={!leaving}>
      <div className="splash-stage">
        <span className="splash-halo" aria-hidden="true" />
        <span className="splash-ring" aria-hidden="true" />
        <svg viewBox="0 0 32 32" className="splash-mark" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="var(--lb-surface-3)" />
          <path
            d="M5 22l6-7 5 4 11-11"
            fill="none"
            stroke="var(--lb-accent-text)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="splash-line"
          />
        </svg>
      </div>
      <span className="splash-word">StrengthBoard</span>
      <span className="splash-tagline">Every lift you track, at a glance</span>
      <span className="sr-only">Loading your board</span>
    </div>
  );
}
