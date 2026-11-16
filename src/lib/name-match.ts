// Name-match score (0-100) between the name the bank returns and the employee's name (M3-BNK-02).
// Case, punctuation, titles and word order do not matter; an initial matches the name that starts
// with it ("R Kumar" ~ "Rahul Kumar"); a small spelling slip costs a few points. Words the other
// side does not have count against the score, so a joint account ("A and B") scores low.

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'shri', 'smt', 'sri', 'kumari', 'dr', 'late']);

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = Math.min(up + 1, row[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length]!;
}

function wordScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.9 : 0;
  return Math.max(0, 1 - editDistance(a, b) / Math.max(a.length, b.length));
}

export function nameMatchScore(bankName: string, employeeName: string): number {
  const a = words(bankName);
  const b = words(employeeName);
  if (a.length === 0 || b.length === 0) return 0;
  // Greedy best pairing: every word is used at most once.
  const pairs: [number, number, number][] = [];
  a.forEach((x, i) => b.forEach((y, j) => pairs.push([wordScore(x, y), i, j])));
  pairs.sort((p, q) => q[0] - p[0]);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let total = 0;
  for (const [s, i, j] of pairs) {
    if (s <= 0 || usedA.has(i) || usedB.has(j)) continue;
    usedA.add(i);
    usedB.add(j);
    total += s;
  }
  return Math.round((100 * total) / Math.max(a.length, b.length));
}

export const NAME_MATCH_THRESHOLD = 80;
