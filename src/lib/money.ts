// Money is bigint paise everywhere. This file is the only place that rounds:
// every other module calls one of these functions and passes the rounding
// mode explicitly, because statutory rules disagree (e.g. ESI rounds up,
// most others round half-up to the rupee).

export type Paise = bigint;

/** half-up: halves move away from zero. up: toward +∞. down: toward −∞. */
export type RoundingMode = 'half-up' | 'up' | 'down';

export const PAISE_PER_RUPEE = 100n;

/** The single rounding primitive: numerator / denominator, rounded by `mode`. */
export function divRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new RangeError('divRound: division by zero');
  if (denominator < 0n) return divRound(-numerator, -denominator, mode);

  const q = numerator / denominator; // truncates toward zero
  const r = numerator % denominator;
  if (r === 0n) return q;

  const floor = numerator < 0n ? q - 1n : q;
  switch (mode) {
    case 'down':
      return floor;
    case 'up':
      return floor + 1n;
    case 'half-up': {
      const twiceRem = 2n * (r < 0n ? -r : r);
      if (twiceRem < denominator) return q;
      return numerator < 0n ? q - 1n : q + 1n;
    }
  }
}

/** Parses a rupee amount like "1234", "1234.5" or "-0.75" into exact paise. */
export function paiseFromRupees(rupees: string): Paise {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(rupees.trim());
  if (!m) throw new RangeError(`not a rupee amount: ${JSON.stringify(rupees)}`);
  const [, sign, whole, frac = ''] = m;
  const value = BigInt(whole!) * PAISE_PER_RUPEE + BigInt(frac.padEnd(2, '0'));
  return sign ? -value : value;
}

/** "123456.78" — plain decimal, for files (ECR, Excel) and JSON. */
export function rupeesString(p: Paise): string {
  const sign = p < 0n ? '-' : '';
  const abs = p < 0n ? -p : p;
  const frac = (abs % PAISE_PER_RUPEE).toString().padStart(2, '0');
  return `${sign}${abs / PAISE_PER_RUPEE}.${frac}`;
}

const inrGrouping = new Intl.NumberFormat('en-IN');

/** "₹1,23,456.78" — Indian digit grouping, for screens and payslips. */
export function formatInr(p: Paise): string {
  const sign = p < 0n ? '-' : '';
  const abs = p < 0n ? -p : p;
  const frac = (abs % PAISE_PER_RUPEE).toString().padStart(2, '0');
  return `${sign}₹${inrGrouping.format(abs / PAISE_PER_RUPEE)}.${frac}`;
}

/** Rounds to a whole number of rupees (still returned in paise). */
export function roundToRupee(p: Paise, mode: RoundingMode): Paise {
  return divRound(p, PAISE_PER_RUPEE, mode) * PAISE_PER_RUPEE;
}

const RATE_SCALE = 10_000n; // rates are Numeric(7,4) percent

/** Parses a percent rate such as "12", "0.75" or "3.2500" (up to 4 decimals). */
export function parseRate(percent: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(percent.trim());
  if (!m) throw new RangeError(`not a percent rate: ${JSON.stringify(percent)}`);
  return BigInt(m[1]!) * RATE_SCALE + BigInt((m[2] ?? '').padEnd(4, '0'));
}

/** `percent`% of `p`, rounded to the paisa by `mode`. */
export function percentOf(p: Paise, percent: string, mode: RoundingMode): Paise {
  return divRound(p * parseRate(percent), 100n * RATE_SCALE, mode);
}

/** p × part / whole — e.g. monthly wage × paid days / days in month. */
export function prorate(p: Paise, part: bigint, whole: bigint, mode: RoundingMode): Paise {
  return divRound(p * part, whole, mode);
}

export function sum(values: Iterable<Paise>): Paise {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function min(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

export function max(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}
