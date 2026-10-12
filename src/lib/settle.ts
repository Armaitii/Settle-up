import { splitEqually } from "./money";

export type MemberBalance = {
  memberId: number;
  name: string;
  isSelf: boolean;
  paidCents: number;
  owedCents: number;
  sentCents: number;
  receivedCents: number;
  netCents: number;
};

export type Transfer = {
  fromMemberId: number;
  fromName: string;
  fromIsSelf: boolean;
  toMemberId: number;
  toName: string;
  toIsSelf: boolean;
  amountCents: number;
};

export type PairDebt = {
  debtorId: number;
  debtorName: string;
  debtorIsSelf: boolean;
  creditorId: number;
  creditorName: string;
  creditorIsSelf: boolean;
  amountCents: number;
};

export type SettlePlan = {
  transfers: Transfer[];
  transactionCount: number;
  rawObligationCount: number;
  savedTransactions: number;
  /** Present for a combined plan with restricted payer pairs. */
  restrictionCount?: number;
  usesIntermediary?: boolean;
  unresolvedMessage?: string | null;
};

export type LedgerInput = {
  members: { id: number; name: string; isSelf: boolean }[];
  /** Every expense with the member that paid it and its shares. */
  expenses: {
    amountCents: number;
    paidById: number;
    shares: { memberId: number; amountCents: number }[];
  }[];
  payments: { fromMemberId: number; toMemberId: number; amountCents: number }[];
};

/** net > 0  =>  the group owes this person money. net < 0 => owes the group. */
export function computeBalances(ledger: LedgerInput): MemberBalance[] {
  const map = new Map<number, MemberBalance>();
  for (const member of ledger.members) {
    map.set(member.id, {
      memberId: member.id,
      name: member.name,
      isSelf: member.isSelf,
      paidCents: 0,
      owedCents: 0,
      sentCents: 0,
      receivedCents: 0,
      netCents: 0,
    });
  }

  for (const expense of ledger.expenses) {
    const payer = map.get(expense.paidById);
    if (payer) payer.paidCents += expense.amountCents;
    for (const share of expense.shares) {
      const debtor = map.get(share.memberId);
      if (debtor) debtor.owedCents += share.amountCents;
    }
  }

  for (const payment of ledger.payments) {
    const from = map.get(payment.fromMemberId);
    const to = map.get(payment.toMemberId);
    if (from) from.sentCents += payment.amountCents;
    if (to) to.receivedCents += payment.amountCents;
  }

  for (const balance of map.values()) {
    balance.netCents =
      balance.paidCents -
      balance.owedCents +
      balance.sentCents -
      balance.receivedCents;
  }

  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

/** Direct "A owes B" amounts derived from the raw ledger (before simplifying). */
export function computePairDebts(ledger: LedgerInput): PairDebt[] {
  const debt = new Map<string, number>();
  const key = (a: number, b: number) => `${a}:${b}`;
  const add = (a: number, b: number, amount: number) => {
    if (a === b || amount === 0) return;
    debt.set(key(a, b), (debt.get(key(a, b)) ?? 0) + amount);
  };

  for (const expense of ledger.expenses) {
    for (const share of expense.shares) {
      add(share.memberId, expense.paidById, share.amountCents);
    }
  }

  for (const payment of ledger.payments) {
    // Paying someone back removes debt in that direction.
    add(payment.toMemberId, payment.fromMemberId, -payment.amountCents);
  }

  const byId = new Map(ledger.members.map((m) => [m.id, m]));
  const result: PairDebt[] = [];
  for (const [pairKey, amount] of debt) {
    if (amount <= 0) continue;
    const [debtorIdRaw, creditorIdRaw] = pairKey.split(":");
    const debtorId = Number(debtorIdRaw);
    const creditorId = Number(creditorIdRaw);
    const debtor = byId.get(debtorId);
    const creditor = byId.get(creditorId);
    if (!debtor || !creditor) continue;
    result.push({
      debtorId,
      debtorName: debtor.name,
      debtorIsSelf: debtor.isSelf,
      creditorId,
      creditorName: creditor.name,
      creditorIsSelf: creditor.isSelf,
      amountCents: amount,
    });
  }

  return result.sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * Minimal-transfer settlement plan.
 *
 * 1. Net everyone's balance down to a single figure.
 * 2. Partition balances into independent zero-sum clusters (bitmask DP) so
 *    people who can be settled among themselves never touch the others.
 * 3. Inside each cluster run greedy min-cash-flow: repeatedly match the
 *    biggest debtor with the biggest creditor. Each transfer retires at least
 *    one person, so a cluster of k people needs at most k - 1 transfers.
 */
export function simplifyDebts(
  balances: { memberId: number; name: string; isSelf: boolean; netCents: number }[],
  rawObligationCount = 0,
): SettlePlan {
  const open = balances
    .map((b) => ({ ...b, netCents: Math.round(b.netCents) }))
    .filter((b) => b.netCents !== 0);

  const clusters = partitionIntoZeroSumClusters(open);
  const transfers: Transfer[] = [];

  for (const cluster of clusters) {
    const debtors = cluster
      .filter((m) => m.netCents < 0)
      .map((m) => ({ ...m, remaining: -m.netCents }))
      .sort((a, b) => b.remaining - a.remaining || a.memberId - b.memberId);
    const creditors = cluster
      .filter((m) => m.netCents > 0)
      .map((m) => ({ ...m, remaining: m.netCents }))
      .sort((a, b) => b.remaining - a.remaining || a.memberId - b.memberId);

    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];
      const amount = Math.min(debtor.remaining, creditor.remaining);
      if (amount > 0) {
        transfers.push({
          fromMemberId: debtor.memberId,
          fromName: debtor.name,
          fromIsSelf: debtor.isSelf,
          toMemberId: creditor.memberId,
          toName: creditor.name,
          toIsSelf: creditor.isSelf,
          amountCents: amount,
        });
      }
      debtor.remaining -= amount;
      creditor.remaining -= amount;
      if (debtor.remaining <= 0) d += 1;
      if (creditor.remaining <= 0) c += 1;
    }
  }

  transfers.sort((a, b) => b.amountCents - a.amountCents);

  return {
    transfers,
    transactionCount: transfers.length,
    rawObligationCount,
    savedTransactions: Math.max(0, rawObligationCount - transfers.length),
  };
}

type ClusterItem = {
  memberId: number;
  name: string;
  isSelf: boolean;
  netCents: number;
};

/**
 * Split the balanced set into maximal subsets whose nets sum to zero.
 * Every resulting cluster is solved independently, which is what lets us beat
 * the naive "everyone pays everyone" plan.
 */
function partitionIntoZeroSumClusters(items: ClusterItem[]): ClusterItem[][] {
  const n = items.length;
  if (n <= 1) return n === 1 ? [[...items]] : [];

  // Whole-set shortcut: either too big for the DP, or already a single
  // connected cluster (the common case), or the data does not balance out.
  const total = items.reduce((a, b) => a + b.netCents, 0);
  if (n > 16 || total !== 0 || n === 2) return [[...items]];

  const size = 1 << n;
  const sums = new Int32Array(size);
  for (let mask = 1; mask < size; mask += 1) {
    const low = mask & -mask;
    const idx = 31 - Math.clz32(low);
    sums[mask] = sums[mask ^ low] + items[idx].netCents;
  }

  const candidates: { mask: number; pop: number }[] = [];
  for (let mask = 1; mask < size; mask += 1) {
    if (sums[mask] !== 0) continue;
    const pop = popcount(mask);
    if (pop < 2 || pop === n) continue;
    candidates.push({ mask, pop });
  }
  candidates.sort((a, b) => b.pop - a.pop || a.mask - b.mask);

  let used = 0;
  const chosen: number[] = [];
  for (const candidate of candidates) {
    if ((candidate.mask & used) !== 0) continue;
    chosen.push(candidate.mask);
    used |= candidate.mask;
  }

  if (chosen.length === 0) return [[...items]];

  const clusters: ClusterItem[][] = [];
  for (const mask of chosen) {
    const cluster: ClusterItem[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) cluster.push(items[i]);
    }
    clusters.push(cluster);
  }

  const leftover: ClusterItem[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!(used & (1 << i))) leftover.push(items[i]);
  }
  if (leftover.length > 0) clusters.push(leftover);

  return clusters;
}

function popcount(value: number): number {
  let v = value;
  let count = 0;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

/** Helper used by the demo seeder and tests. */
export function equalSharesFor(
  memberIds: number[],
  amountCents: number,
): { memberId: number; amountCents: number }[] {
  return splitEqually(amountCents, memberIds.length).map((amountCents, i) => ({
    memberId: memberIds[i],
    amountCents,
  }));
}
