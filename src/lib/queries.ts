import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  expenseShares,
  expenses,
  groups,
  members,
  payments,
  transferRestrictions,
  type GroupRow,
  type MemberRow,
} from "@/db/schema";
import {
  computeBalances,
  computePairDebts,
  simplifyDebts,
  type LedgerInput,
  type MemberBalance,
  type PairDebt,
  type SettlePlan,
} from "./settle";
import { simplifyWithRestrictions } from "./restricted-settle";

export type ExpenseView = {
  id: number;
  groupId: number;
  kind: string;
  description: string;
  amountCents: number;
  paidById: number;
  paidByName: string;
  paidByIsSelf: boolean;
  splitMode: string;
  notes: string | null;
  occurredOn: string;
  reversesId: number | null;
  createdAt: string;
  shares: { memberId: number; name: string; isSelf: boolean; amountCents: number }[];
};

export type PaymentView = {
  id: number;
  groupId: number;
  fromMemberId: number;
  fromName: string;
  fromIsSelf: boolean;
  toMemberId: number;
  toName: string;
  toIsSelf: boolean;
  amountCents: number;
  note: string | null;
  occurredOn: string;
  reversesId: number | null;
  createdAt: string;
};

export type GroupDetail = {
  group: GroupRow;
  members: MemberRow[];
  expenses: ExpenseView[];
  payments: PaymentView[];
  balances: MemberBalance[];
  pairDebts: PairDebt[];
  plan: SettlePlan;
  totals: {
    expenseCount: number;
    debtCount: number;
    paymentCount: number;
    trackedCents: number;
    settledCents: number;
  };
};

export async function listGroups() {
  const groupRows = await db.select().from(groups).orderBy(desc(groups.createdAt), desc(groups.id));
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);

  const [memberRows, expenseRows, paymentRows] = await Promise.all([
    db.select().from(members).where(inArray(members.groupId, groupIds)),
    db.select().from(expenses).where(inArray(expenses.groupId, groupIds)),
    db.select().from(payments).where(inArray(payments.groupId, groupIds)),
  ]);

  const shareRows = expenseRows.length
    ? await db
        .select()
        .from(expenseShares)
        .where(
          inArray(
            expenseShares.expenseId,
            expenseRows.map((expense) => expense.id),
          ),
        )
    : [];

  const groupByExpenseId = new Map(expenseRows.map((e) => [e.id, e.groupId]));
  const sharesByGroup = new Map<
    number,
    { expenseId: number; memberId: number; amountCents: number }[]
  >();
  for (const share of shareRows) {
    const groupId = groupByExpenseId.get(share.expenseId);
    if (groupId == null) continue;
    const list = sharesByGroup.get(groupId) ?? [];
    list.push({
      expenseId: share.expenseId,
      memberId: share.memberId,
      amountCents: share.amountCents,
    });
    sharesByGroup.set(groupId, list);
  }

  return groupRows.map((group) => {
    const groupMembers = memberRows.filter((m) => m.groupId === group.id);
    const groupExpenses = expenseRows.filter((e) => e.groupId === group.id);
    const groupPayments = paymentRows.filter((p) => p.groupId === group.id);
    const groupShares = sharesByGroup.get(group.id) ?? [];
    const ledger = buildLedger(groupMembers, groupExpenses, groupPayments, groupShares);
    const balances = computeBalances(ledger);
    const self = balances.find((b) => b.isSelf);
    return {
      group,
      memberCount: groupMembers.length,
      expenseCount: groupExpenses.length,
      paymentCount: groupPayments.length,
      balances,
      selfName: self?.name ?? null,
      selfNetCents: self?.netCents ?? 0,
      plan: simplifyDebts(balances, groupShares.length + groupPayments.length),
    };
  });
}

export async function getGroupDetail(groupId: number): Promise<GroupDetail | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return null;

  const [memberRows, expenseRows, paymentRows] = await Promise.all([
    db.select().from(members).where(eq(members.groupId, groupId)).orderBy(members.id),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.occurredOn), desc(expenses.id)),
    db
      .select()
      .from(payments)
      .where(eq(payments.groupId, groupId))
      .orderBy(desc(payments.occurredOn), desc(payments.id)),
  ]);

  const expenseIds = expenseRows.map((e) => e.id);
  const shareRows = expenseIds.length
    ? await db.select().from(expenseShares).where(inArray(expenseShares.expenseId, expenseIds))
    : [];

  const sharesByExpense = new Map<number, { memberId: number; amountCents: number }[]>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ memberId: share.memberId, amountCents: share.amountCents });
    sharesByExpense.set(share.expenseId, list);
  }

  const memberById = new Map(memberRows.map((m) => [m.id, m]));

  const expenseViews: ExpenseView[] = expenseRows.map((expense) => {
    const payer = memberById.get(expense.paidById);
    const shares = (sharesByExpense.get(expense.id) ?? [])
      .map((share) => {
        const member = memberById.get(share.memberId);
        return {
          memberId: share.memberId,
          name: member?.name ?? "Unknown",
          isSelf: member?.isSelf ?? false,
          amountCents: share.amountCents,
        };
      })
      .sort((a, b) => a.memberId - b.memberId);

    return {
      id: expense.id,
      groupId: expense.groupId,
      kind: expense.kind,
      description: expense.description,
      amountCents: expense.amountCents,
      paidById: expense.paidById,
      paidByName: payer?.name ?? "Unknown",
      paidByIsSelf: payer?.isSelf ?? false,
      splitMode: expense.splitMode,
      notes: expense.notes,
      occurredOn: expense.occurredOn,
      reversesId: expense.reversesId,
      createdAt: toIso(expense.createdAt),
      shares,
    };
  });

  const paymentViews: PaymentView[] = paymentRows.map((payment) => {
    const from = memberById.get(payment.fromMemberId);
    const to = memberById.get(payment.toMemberId);
    return {
      id: payment.id,
      groupId: payment.groupId,
      fromMemberId: payment.fromMemberId,
      fromName: from?.name ?? "Unknown",
      fromIsSelf: from?.isSelf ?? false,
      toMemberId: payment.toMemberId,
      toName: to?.name ?? "Unknown",
      toIsSelf: to?.isSelf ?? false,
      amountCents: payment.amountCents,
      note: payment.note,
      occurredOn: payment.occurredOn,
      reversesId: payment.reversesId,
      createdAt: toIso(payment.createdAt),
    };
  });

  const ledger: LedgerInput = {
    members: memberRows.map((m) => ({ id: m.id, name: m.name, isSelf: m.isSelf })),
    expenses: expenseRows.map((expense) => ({
      amountCents: expense.amountCents,
      paidById: expense.paidById,
      shares: sharesByExpense.get(expense.id) ?? [],
    })),
    payments: paymentRows.map((p) => ({
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amountCents: p.amountCents,
    })),
  };

  const balances = computeBalances(ledger);
  const pairDebts = computePairDebts(ledger);
  const rawObligationCount =
    expenseRows.reduce((acc, expense) => {
      const shares = sharesByExpense.get(expense.id) ?? [];
      return acc + shares.filter((s) => s.memberId !== expense.paidById).length;
    }, 0) + paymentRows.length;

  const plan = simplifyDebts(balances, rawObligationCount);
  const trackedCents = expenseRows.reduce((acc, e) => acc + e.amountCents, 0);
  const settledCents = paymentRows.reduce((acc, p) => acc + p.amountCents, 0);

  return {
    group,
    members: memberRows,
    expenses: expenseViews,
    payments: paymentViews,
    balances,
    pairDebts,
    plan,
    totals: {
      expenseCount: expenseRows.filter((e) => e.kind === "expense").length,
      debtCount: expenseRows.filter((e) => e.kind === "debt").length,
      paymentCount: paymentRows.length,
      trackedCents,
      settledCents,
    },
  };
}

/** Optional "combine every group" view: same person across groups nets once. */
export async function getCrossGroupSummary() {
  const groupRows = await db.select().from(groups).orderBy(groups.id);
  if (groupRows.length === 0) {
    return { people: [], plan: simplifyDebts([]), groupCount: 0 };
  }

  const [memberRows, expenseRows, paymentRows, shareRows, restrictionRows] = await Promise.all([
    db.select().from(members),
    db.select().from(expenses),
    db.select().from(payments),
    db.select().from(expenseShares),
    db.select().from(transferRestrictions).orderBy(desc(transferRestrictions.createdAt)),
  ]);

  const sharesByExpense = new Map<number, { memberId: number; amountCents: number }[]>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ memberId: share.memberId, amountCents: share.amountCents });
    sharesByExpense.set(share.expenseId, list);
  }

  const membersByGroup = new Map<number, typeof memberRows>();
  for (const member of memberRows) {
    const list = membersByGroup.get(member.groupId) ?? [];
    list.push(member);
    membersByGroup.set(member.groupId, list);
  }

  const aggregated = new Map<
    string,
    { name: string; isSelf: boolean; netCents: number; groupIds: Set<number> }
  >();
  let rawObligations = 0;

  for (const group of groupRows) {
    const groupMembers = membersByGroup.get(group.id) ?? [];
    const groupExpenses = expenseRows.filter((e) => e.groupId === group.id);
    const groupPayments = paymentRows.filter((p) => p.groupId === group.id);
    const ledger: LedgerInput = {
      members: groupMembers.map((m) => ({ id: m.id, name: m.name, isSelf: m.isSelf })),
      expenses: groupExpenses.map((e) => ({
        amountCents: e.amountCents,
        paidById: e.paidById,
        shares: sharesByExpense.get(e.id) ?? [],
      })),
      payments: groupPayments.map((p) => ({
        fromMemberId: p.fromMemberId,
        toMemberId: p.toMemberId,
        amountCents: p.amountCents,
      })),
    };

    for (const balance of computeBalances(ledger)) {
      const key = balance.name.trim().toLowerCase();
      const existing = aggregated.get(key);
      if (existing) {
        existing.netCents += balance.netCents;
        existing.groupIds.add(group.id);
        existing.isSelf = existing.isSelf || balance.isSelf;
      } else {
        aggregated.set(key, {
          name: balance.name,
          isSelf: balance.isSelf,
          netCents: balance.netCents,
          groupIds: new Set([group.id]),
        });
      }
    }

    rawObligations += groupExpenses.reduce(
      (acc, e) =>
        acc + (sharesByExpense.get(e.id) ?? []).filter((s) => s.memberId !== e.paidById).length,
      0,
    );
    rawObligations += groupPayments.length;
  }

  const people = [...aggregated.values()]
    .map((person, index) => ({
      memberId: -(index + 1),
      name: person.name,
      isSelf: person.isSelf,
      netCents: person.netCents,
      groupCount: person.groupIds.size,
    }))
    .sort((a, b) => b.netCents - a.netCents);

  return {
    people,
    plan: simplifyWithRestrictions(people, rawObligations, restrictionRows),
    restrictions: restrictionRows,
    groupCount: groupRows.length,
  };
}

export async function assertMemberOfGroup(memberId: number, groupId: number) {
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)))
    .limit(1);
  return row ?? null;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function dateOnly(value: Date | string | null | undefined) {
  const iso = toIso(value);
  return iso.slice(0, 10);
}

export type HistoryKind = "group" | "member" | "expense" | "debt" | "payment";

export type HistoryItem = {
  key: string;
  kind: HistoryKind;
  date: string;
  createdAt: string;
  groupId: number | null;
  groupName: string | null;
  currency: string;
  title: string;
  summary: string;
  amountCents: number | null;
  undoable: boolean;
  isReversal: boolean;
  expense: ExpenseView | null;
  payment: PaymentView | null;
  member: {
    id: number;
    groupId: number;
    name: string;
    email: string | null;
    isSelf: boolean;
  } | null;
  group: {
    id: number;
    name: string;
    description: string | null;
    currency: string;
  } | null;
};

export async function listHistory() {
  const [groupRows, memberRows, expenseRows, paymentRows, shareRows] = await Promise.all([
    db.select().from(groups).orderBy(desc(groups.createdAt)),
    db.select().from(members),
    db.select().from(expenses),
    db.select().from(payments),
    db.select().from(expenseShares),
  ]);

  const groupById = new Map(groupRows.map((row) => [row.id, row]));
  const memberById = new Map(memberRows.map((row) => [row.id, row]));
  const sharesByExpense = new Map<number, { memberId: number; amountCents: number }[]>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ memberId: share.memberId, amountCents: share.amountCents });
    sharesByExpense.set(share.expenseId, list);
  }

  const undoneExpenseIds = new Set(
    expenseRows.filter((row) => row.reversesId != null).map((row) => row.reversesId as number),
  );
  const undonePaymentIds = new Set(
    paymentRows.filter((row) => row.reversesId != null).map((row) => row.reversesId as number),
  );

  const membersByGroup: Record<
    number,
    { id: number; name: string; isSelf: boolean; email: string | null }[]
  > = {};
  for (const member of memberRows) {
    const list = membersByGroup[member.groupId] ?? [];
    list.push({
      id: member.id,
      name: member.name,
      isSelf: member.isSelf,
      email: member.email,
    });
    membersByGroup[member.groupId] = list;
  }

  const items: HistoryItem[] = [];

  for (const group of groupRows) {
    items.push({
      key: `group:${group.id}`,
      kind: "group",
      date: dateOnly(group.createdAt),
      createdAt: toIso(group.createdAt),
      groupId: group.id,
      groupName: group.name,
      currency: group.currency,
      title: `Created group “${group.name}”`,
      summary: group.description ?? "No description",
      amountCents: null,
      undoable: false,
      isReversal: false,
      expense: null,
      payment: null,
      member: null,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        currency: group.currency,
      },
    });
  }

  for (const member of memberRows) {
    const group = groupById.get(member.groupId);
    items.push({
      key: `member:${member.id}`,
      kind: "member",
      date: dateOnly(member.createdAt),
      createdAt: toIso(member.createdAt),
      groupId: member.groupId,
      groupName: group?.name ?? "Unknown group",
      currency: group?.currency ?? "USD",
      title: `${member.name} joined ${group?.name ?? "a group"}`,
      summary: member.isSelf ? "Marked as you" : (member.email ?? "Member added"),
      amountCents: null,
      undoable: false,
      isReversal: false,
      expense: null,
      payment: null,
      member: {
        id: member.id,
        groupId: member.groupId,
        name: member.name,
        email: member.email,
        isSelf: member.isSelf,
      },
      group: null,
    });
  }

  for (const expense of expenseRows) {
    const group = groupById.get(expense.groupId);
    const payer = memberById.get(expense.paidById);
    const shares = (sharesByExpense.get(expense.id) ?? []).map((share) => {
      const person = memberById.get(share.memberId);
      return {
        memberId: share.memberId,
        name: person?.name ?? "Unknown",
        isSelf: person?.isSelf ?? false,
        amountCents: share.amountCents,
      };
    });
    const kind: HistoryKind = expense.kind === "debt" ? "debt" : "expense";
    const view: ExpenseView = {
      id: expense.id,
      groupId: expense.groupId,
      kind: expense.kind,
      description: expense.description,
      amountCents: expense.amountCents,
      paidById: expense.paidById,
      paidByName: payer?.name ?? "Unknown",
      paidByIsSelf: payer?.isSelf ?? false,
      splitMode: expense.splitMode,
      notes: expense.notes,
      occurredOn: expense.occurredOn,
      reversesId: expense.reversesId,
      createdAt: toIso(expense.createdAt),
      shares,
    };
    const debtor = shares[0];
    const summary =
      kind === "debt"
        ? `${debtor?.isSelf ? "You" : debtor?.name ?? "Someone"} owes ${
            payer?.isSelf ? "you" : payer?.name ?? "someone"
          }`
        : `${payer?.isSelf ? "You" : payer?.name ?? "Someone"} paid · ${
            expense.splitMode === "exact" ? "custom split" : "split equally"
          }`;

    items.push({
      key: `expense:${expense.id}`,
      kind,
      date: expense.occurredOn,
      createdAt: toIso(expense.createdAt),
      groupId: expense.groupId,
      groupName: group?.name ?? "Unknown group",
      currency: group?.currency ?? "USD",
      title: expense.description,
      summary,
      amountCents: expense.amountCents,
      undoable: !expense.reversesId && !undoneExpenseIds.has(expense.id),
      isReversal: expense.reversesId != null,
      expense: view,
      payment: null,
      member: null,
      group: null,
    });
  }

  for (const payment of paymentRows) {
    const group = groupById.get(payment.groupId);
    const from = memberById.get(payment.fromMemberId);
    const to = memberById.get(payment.toMemberId);
    const view: PaymentView = {
      id: payment.id,
      groupId: payment.groupId,
      fromMemberId: payment.fromMemberId,
      fromName: from?.name ?? "Unknown",
      fromIsSelf: from?.isSelf ?? false,
      toMemberId: payment.toMemberId,
      toName: to?.name ?? "Unknown",
      toIsSelf: to?.isSelf ?? false,
      amountCents: payment.amountCents,
      note: payment.note,
      occurredOn: payment.occurredOn,
      reversesId: payment.reversesId,
      createdAt: toIso(payment.createdAt),
    };
    items.push({
      key: `payment:${payment.id}`,
      kind: "payment",
      date: payment.occurredOn,
      createdAt: toIso(payment.createdAt),
      groupId: payment.groupId,
      groupName: group?.name ?? "Unknown group",
      currency: group?.currency ?? "USD",
      title: `${from?.isSelf ? "You" : from?.name ?? "Someone"} paid ${
        to?.isSelf ? "you" : to?.name ?? "someone"
      }`,
      summary: payment.note ?? "Payment recorded",
      amountCents: payment.amountCents,
      undoable: !payment.reversesId && !undonePaymentIds.has(payment.id),
      isReversal: payment.reversesId != null,
      expense: null,
      payment: view,
      member: null,
      group: null,
    });
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return { items, membersByGroup };
}

function buildLedger(
  memberRows: MemberRow[],
  expenseRows: { id: number; amountCents: number; paidById: number }[],
  paymentRows: { fromMemberId: number; toMemberId: number; amountCents: number }[],
  shareRows: { expenseId: number; memberId: number; amountCents: number }[],
): LedgerInput {
  const sharesByExpense = new Map<number, { memberId: number; amountCents: number }[]>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ memberId: share.memberId, amountCents: share.amountCents });
    sharesByExpense.set(share.expenseId, list);
  }
  return {
    members: memberRows.map((m) => ({ id: m.id, name: m.name, isSelf: m.isSelf })),
    expenses: expenseRows.map((e) => ({
      amountCents: e.amountCents,
      paidById: e.paidById,
      shares: sharesByExpense.get(e.id) ?? [],
    })),
    payments: paymentRows.map((p) => ({
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amountCents: p.amountCents,
    })),
  };
}
