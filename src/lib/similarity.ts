
const ALIASES: Record<string, string> = {
  bb: 'barbell',
  db: 'dumbbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  dl: 'deadlift',
  bp: 'bench press',
  sq: 'squat',
  pullup: 'pull up',
  pullups: 'pull up',
  chinup: 'chin up',
  chinups: 'chin up',
  pushup: 'push up',
  pushups: 'push up',
  situp: 'sit up',
  dip: 'dips',
  mil: 'military',
  inc: 'incline',
  dec: 'decline',
};

export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w);
  return words.join(' ');
}

function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function tokens(norm: string): string[] {
  return norm.split(' ').filter(Boolean).map(stem);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function ratio(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len === 0 ? 1 : 1 - editDistance(a, b) / len;
}

export function similarity(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  const qt = tokens(q);
  const nt = tokens(n);
  if (qt.join(' ') === nt.join(' ')) return 1;
  const compact = (t: string[]) => stem(t.join(''));
  if (compact(qt) === compact(nt)) return 1;

  const qSet = new Set(qt);
  const nSet = new Set(nt);
  const shared = qt.filter((t) => nSet.has(t)).length;
  let score = 0;
  if (shared === qSet.size || shared === nSet.size) {
    score = 0.72 + 0.2 * (shared / Math.max(qSet.size, nSet.size));
  } else if (shared > 0) {
    score = (0.7 * (2 * shared)) / (qSet.size + nSet.size);
  }

  const prefixHits = qt.filter((t) => nt.some((w) => w.startsWith(t))).length;
  if (prefixHits === qt.length) score = Math.max(score, 0.55 + 0.25 * (q.length / n.length));

  score = Math.max(score, ratio(q.replace(/ /g, ''), n.replace(/ /g, '')) * 0.95);
  const tokenFit =
    qt.reduce((acc, t) => acc + Math.max(...nt.map((w) => ratio(t, w))), 0) / Math.max(qt.length, nt.length);
  score = Math.max(score, tokenFit * 0.9);

  return Math.min(score, 0.99);
}

export interface Match<T> {
  item: T;
  score: number;
}

export function rankMatches<T>(query: string, items: T[], getName: (t: T) => string, min = 0.5): Match<T>[] {
  if (!query.trim()) return [];
  return items
    .map((item) => ({ item, score: similarity(query, getName(item)) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score);
}
