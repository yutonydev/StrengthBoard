const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function fmtShortDate(iso: string, ref: string = today()): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  return String(y) === ref.slice(0, 4) ? base : `${base} ’${String(y).slice(2)}`;
}

export function fmtWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

export function fmtAgo(iso: string, ref: string = today()): string {
  const n = daysBetween(iso, ref);
  if (n <= 0) return 'Today';
  if (n < 14) return `${n}d`;
  if (n < 60) return `${Math.floor(n / 7)}w`;
  if (n < 365) return `${Math.floor(n / 30)}mo`;
  return `${Math.floor(n / 365)}y`;
}

export function fmtAgoLong(iso: string, ref: string = today()): string {
  const n = daysBetween(iso, ref);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}
