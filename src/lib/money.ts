/** All arithmetic happens in integer cents to avoid floating point drift. */

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AUD",
  "CAD",
  "JPY",
  "SGD",
  "AED",
] as const;

export function centsFromInput(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim().replace(/[$,\s]/g, "");
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;

  const negative = parsed < 0;
  const cents = Math.round(Math.abs(parsed) * 100);
  return negative ? -cents : cents;
}

export function formatCents(cents: number, currency = "USD"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Split `totalCents` across `weights` proportionally, remainder-safe. */
export function splitByWeights(
  totalCents: number,
  weights: number[],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    return splitEqually(totalCents, n);
  }

  const raw = weights.map((w) => (totalCents * w) / weightSum);
  const floors = raw.map((r) => Math.floor(r));
  let allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = totalCents - allocated;

  // Distribute leftover cents to the largest fractional parts (stable order).
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  let cursor = 0;
  while (remainder !== 0 && order.length > 0) {
    const target = order[cursor % order.length].i;
    if (remainder > 0) {
      result[target] += 1;
      remainder -= 1;
    } else {
      result[target] -= 1;
      remainder += 1;
    }
    cursor += 1;
  }
  return result;
}

export function splitEqually(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / n);
  let remainder = abs - base * n;
  const result = new Array<number>(n).fill(base * sign);
  let i = 0;
  while (remainder > 0) {
    result[i % n] += sign;
    remainder -= 1;
    i += 1;
  }
  return result;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
