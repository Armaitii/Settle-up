import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  expenseShares,
  expenses,
  groups,
  members,
  payments,
  transferRestrictions,
} from "@/db/schema";
import {
  ApiError,
  optionalString as optionalText,
  requireDate,
  requireId,
  requireString as requireText,
} from "./api";
import { CURRENCIES, centsFromInput, splitEqually, todayIso } from "./money";
import { assertMemberOfGroup } from "./queries";

export async function createGroup(input: {
  name: unknown;
  description: unknown;
  currency: unknown;
  yourName: unknown;
  memberNames: unknown;
}) {
  const name = requireText(input.name, "Group name");
  const description = optionalText(input.description, "Description");
  const currencyRaw = typeof input.currency === "string" ? input.currency.toUpperCase() : "USD";
  const currency = (CURRENCIES as readonly string[]).includes(currencyRaw) ? currencyRaw : "USD";

  const yourName = requireText(input.yourName, "Your name");
  const rawMemberNames = Array.isArray(input.memberNames) ? input.memberNames : [];
  const memberNames = rawMemberNames
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .slice(0, 40);

  const uniqueNames = new Set<string>([yourName]);
  for (const memberName of memberNames) {
    const key = memberName.toLowerCase();
    if (uniqueNames.has(key)) continue;
    uniqueNames.add(key);
    if (uniqueNames.size > 40) break;
  }

  const [group] = await db
    .insert(groups)
    .values({ name, description, currency })
    .returning();

  await db.insert(members).values(
    [...uniqueNames].map((memberName) => ({
      groupId: group.id,
      name: memberName === yourName.toLowerCase() ? yourName : memberName,
      isSelf: memberName === yourName.toLowerCase(),
    })),
  );

  return group;
}

export async function updateGroup(
  groupId: number,
  input: { name: unknown; description: unknown; currency: unknown },
) {
  const [existing] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!existing) throw new ApiError("Group not found", 404);

  const patch: { name?: string; description?: string | null; currency?: string } = {};
  if (input.name !== undefined) patch.name = requireText(input.name, "Group name");
  if (input.description !== undefined) {
    patch.description = optionalText(input.description, "Description");
  }
  if (input.currency !== undefined) {
    const currency = String(input.currency).toUpperCase();
    if (!(CURRENCIES as readonly string[]).includes(currency)) {
      throw new ApiError("Unsupported currency");
    }
    patch.currency = currency;
  }
  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  const [updated] = await db
    .update(groups)
    .set(patch)
    .where(eq(groups.id, groupId))
    .returning();
  return updated;
}

export async function deleteGroup(groupId: number) {
  const deleted = await db.delete(groups).where(eq(groups.id, groupId)).returning();
  if (deleted.length === 0) throw new ApiError("Group not found", 404);
  return deleted[0];
}

export async function addMember(
  groupId: number,
  input: { name: unknown; email: unknown; isSelf: unknown },
) {
  const name = requireText(input.name, "Member name", 80);
  const email = optionalText(input.email, "Email", 160);
  const isSelf = input.isSelf === true;

  const existing = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.name, name)))
    .limit(1);
  if (existing.length > 0) throw new ApiError("That person is already in this group");

  if (isSelf) {
    await db
      .update(members)
      .set({ isSelf: false })
      .where(eq(members.groupId, groupId));
  }

  const [member] = await db
    .insert(members)
    .values({ groupId, name, email, isSelf })
    .returning();
  return member;
}

export async function updateMember(
  memberId: number,
  input: { name: unknown; email: unknown; isSelf: unknown },
) {
  const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!member) throw new ApiError("Member not found", 404);

  const patch: { name?: string; email?: string | null; isSelf?: boolean } = {};
  if (input.name !== undefined) {
    const name = requireText(input.name, "Member name", 80);
    const clash = await db
      .select()
      .from(members)
      .where(and(eq(members.groupId, member.groupId), eq(members.name, name)))
      .limit(1);
    if (clash.length > 0 && clash[0].id !== memberId) {
      throw new ApiError("That person is already in this group");
    }
    patch.name = name;
  }
  if (input.email !== undefined) patch.email = optionalText(input.email, "Email", 160);
  if (input.isSelf !== undefined) patch.isSelf = input.isSelf === true;

  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  if (patch.isSelf) {
    await db
      .update(members)
      .set({ isSelf: false })
      .where(eq(members.groupId, member.groupId));
  }

  const [updated] = await db
    .update(members)
    .set(patch)
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

export async function deleteMember(memberId: number) {
  const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!member) throw new ApiError("Member not found", 404);

  const [paid, owed] = await Promise.all([
    db.select({ id: expenses.id }).from(expenses).where(eq(expenses.paidById, memberId)).limit(1),
    db.select({ id: expenseShares.id }).from(expenseShares).where(eq(expenseShares.memberId, memberId)).limit(1),
  ]);
  if (paid.length > 0 || owed.length > 0) {
    throw new ApiError(
      "This person already has expenses in the group. Delete those entries first.",
      409,
    );
  }

  const sent = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.fromMemberId, memberId))
    .limit(1);
  const received = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.toMemberId, memberId))
    .limit(1);
  if (sent.length > 0 || received.length > 0) {
    throw new ApiError("This person has recorded payments. Delete those first.", 409);
  }

  await db.delete(members).where(eq(members.id, memberId));
  return member;
}

export type ExpenseInput = {
  kind: unknown;
  description: unknown;
  amount: unknown;
  paidById: unknown;
  debtorId?: unknown;
  participantIds?: unknown;
  exactAmounts?: unknown;
  splitMode?: unknown;
  notes?: unknown;
  occurredOn?: unknown;
};

async function prepareExpense(groupId: number, input: ExpenseInput) {
  const kind = input.kind === "debt" ? "debt" : "expense";
  const description = requireText(input.description, "Description", 160);
  const amountCents = centsFromInput(input.amount);
  if (amountCents == null || amountCents <= 0) {
    throw new ApiError("Amount must be greater than zero");
  }

  const paidById = requireId(input.paidById, "Paid by");
  const payer = await assertMemberOfGroup(paidById, groupId);
  if (!payer) throw new ApiError("The payer is not a member of this group");

  const notes = optionalText(input.notes, "Notes", 500);
  const occurredOn = requireDate(input.occurredOn, "Date");
  const groupMembers = await db.select().from(members).where(eq(members.groupId, groupId));
  const memberIds = new Set(groupMembers.map((m) => m.id));

  let shares: { memberId: number; amountCents: number }[];
  let splitMode: string;

  if (kind === "debt") {
    const debtorId = requireId(input.debtorId, "Debtor");
    if (!memberIds.has(debtorId)) throw new ApiError("The debtor is not a member of this group");
    if (debtorId === paidById) throw new ApiError("Someone cannot owe themselves");
    shares = [{ memberId: debtorId, amountCents }];
    splitMode = "exact";
  } else {
    const participants = Array.isArray(input.participantIds)
      ? input.participantIds.map((value) => Number(value)).filter((id) => Number.isInteger(id))
      : [];
    const unique = [...new Set(participants)].filter((id) => memberIds.has(id));
    if (unique.length === 0) throw new ApiError("Pick at least one person to split with");

    splitMode = input.splitMode === "exact" ? "exact" : "equal";
    if (splitMode === "exact") {
      const exactMap = new Map<number, number>();
      if (input.exactAmounts && typeof input.exactAmounts === "object") {
        for (const [key, value] of Object.entries(input.exactAmounts as Record<string, unknown>)) {
          const id = Number(key);
          if (!unique.includes(id)) continue;
          const cents = centsFromInput(value);
          if (cents == null || cents < 0) throw new ApiError("Invalid share amount");
          exactMap.set(id, cents);
        }
      }
      const sum = [...exactMap.values()].reduce((a, b) => a + b, 0);
      if (sum !== amountCents) {
        throw new ApiError("Custom shares must add up to the total amount");
      }
      shares = unique.map((id) => ({ memberId: id, amountCents: exactMap.get(id) ?? 0 }));
    } else {
      const amounts = splitEqually(amountCents, unique.length);
      shares = unique.map((id, index) => ({ memberId: id, amountCents: amounts[index] }));
    }
  }

  return { kind, description, amountCents, paidById, splitMode, notes, occurredOn, shares };
}

export async function createExpense(groupId: number, input: ExpenseInput, reversesId?: number) {
  const prepared = await prepareExpense(groupId, input);
  const [expense] = await db
    .insert(expenses)
    .values({
      groupId,
      kind: prepared.kind,
      description: prepared.description,
      amountCents: prepared.amountCents,
      paidById: prepared.paidById,
      splitMode: prepared.splitMode,
      notes: prepared.notes,
      occurredOn: prepared.occurredOn,
      reversesId: reversesId ?? null,
    })
    .returning();

  await db.insert(expenseShares).values(
    prepared.shares.map((share) => ({
      expenseId: expense.id,
      memberId: share.memberId,
      amountCents: share.amountCents,
    })),
  );

  return expense;
}

export async function updateExpense(expenseId: number, input: ExpenseInput) {
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!existing) throw new ApiError("Entry not found", 404);

  const prepared = await prepareExpense(existing.groupId, input);
  const [updated] = await db
    .update(expenses)
    .set({
      kind: prepared.kind,
      description: prepared.description,
      amountCents: prepared.amountCents,
      paidById: prepared.paidById,
      splitMode: prepared.splitMode,
      notes: prepared.notes,
      occurredOn: prepared.occurredOn,
    })
    .where(eq(expenses.id, expenseId))
    .returning();

  await db.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
  await db.insert(expenseShares).values(
    prepared.shares.map((share) => ({
      expenseId,
      memberId: share.memberId,
      amountCents: share.amountCents,
    })),
  );

  return updated;
}

export async function deleteExpense(expenseId: number) {
  const deleted = await db.delete(expenses).where(eq(expenses.id, expenseId)).returning();
  if (deleted.length === 0) throw new ApiError("Entry not found", 404);
  return deleted[0];
}

export async function undoExpense(expenseId: number) {
  const [original] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!original) throw new ApiError("Entry not found", 404);
  if (original.reversesId) {
    throw new ApiError("This entry is already an undo. Delete it to drop the reversal.");
  }

  const already = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.reversesId, expenseId))
    .limit(1);
  if (already.length > 0) throw new ApiError("This entry has already been undone");

  const shares = await db
    .select()
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId));
  if (shares.length === 0) throw new ApiError("Nothing to reverse on this entry");

  const date = todayIso();
  const created = [];

  if (original.kind === "debt") {
    const debtorId = shares[0]?.memberId;
    if (!debtorId || debtorId === original.paidById) {
      throw new ApiError("This debt cannot be reversed");
    }
    created.push(
      await createExpense(
        original.groupId,
        {
          kind: "debt",
          description: original.description.startsWith("Undo:")
            ? original.description
            : `Undo: ${original.description}`,
          amount: original.amountCents / 100,
          paidById: debtorId,
          debtorId: original.paidById,
          notes: `Opposite of “${original.description}”`,
          occurredOn: date,
        },
        expenseId,
      ),
    );
    return created;
  }

  const others = shares.filter(
    (share) => share.memberId !== original.paidById && share.amountCents > 0,
  );
  if (others.length === 0) throw new ApiError("This expense has no counterpart to reverse");

  for (const share of others) {
    created.push(
      await createExpense(
        original.groupId,
        {
          kind: "debt",
          description: `Undo: ${original.description}`,
          amount: share.amountCents / 100,
          paidById: share.memberId,
          debtorId: original.paidById,
          notes: `Opposite of “${original.description}”`,
          occurredOn: date,
        },
        expenseId,
      ),
    );
  }
  return created;
}

export async function createPayment(
  groupId: number,
  input: {
    fromMemberId: unknown;
    toMemberId: unknown;
    amount: unknown;
    note?: unknown;
    occurredOn?: unknown;
  },
  reversesId?: number,
) {
  const fromMemberId = requireId(input.fromMemberId, "From");
  const toMemberId = requireId(input.toMemberId, "To");
  if (fromMemberId === toMemberId) throw new ApiError("Pick two different people");

  const amountCents = centsFromInput(input.amount);
  if (amountCents == null || amountCents <= 0) {
    throw new ApiError("Amount must be greater than zero");
  }

  const [from, to] = await Promise.all([
    assertMemberOfGroup(fromMemberId, groupId),
    assertMemberOfGroup(toMemberId, groupId),
  ]);
  if (!from || !to) throw new ApiError("Both people must belong to this group");

  const [payment] = await db
    .insert(payments)
    .values({
      groupId,
      fromMemberId,
      toMemberId,
      amountCents,
      note: optionalText(input.note, "Note", 200),
      occurredOn: requireDate(input.occurredOn, "Date"),
      reversesId: reversesId ?? null,
    })
    .returning();
  return payment;
}

export async function updatePayment(
  paymentId: number,
  input: {
    fromMemberId: unknown;
    toMemberId: unknown;
    amount: unknown;
    note?: unknown;
    occurredOn?: unknown;
  },
) {
  const [existing] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!existing) throw new ApiError("Payment not found", 404);

  const fromMemberId = requireId(input.fromMemberId, "From");
  const toMemberId = requireId(input.toMemberId, "To");
  if (fromMemberId === toMemberId) throw new ApiError("Pick two different people");

  const amountCents = centsFromInput(input.amount);
  if (amountCents == null || amountCents <= 0) {
    throw new ApiError("Amount must be greater than zero");
  }

  const [from, to] = await Promise.all([
    assertMemberOfGroup(fromMemberId, existing.groupId),
    assertMemberOfGroup(toMemberId, existing.groupId),
  ]);
  if (!from || !to) throw new ApiError("Both people must belong to this group");

  const [updated] = await db
    .update(payments)
    .set({
      fromMemberId,
      toMemberId,
      amountCents,
      note: optionalText(input.note, "Note", 200),
      occurredOn: requireDate(input.occurredOn, "Date"),
    })
    .where(eq(payments.id, paymentId))
    .returning();
  return updated;
}

export async function undoPayment(paymentId: number) {
  const [original] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!original) throw new ApiError("Payment not found", 404);
  if (original.reversesId) {
    throw new ApiError("This payment is already an undo. Delete it to drop the reversal.");
  }

  const already = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.reversesId, paymentId))
    .limit(1);
  if (already.length > 0) throw new ApiError("This payment has already been undone");

  return createPayment(
    original.groupId,
    {
      fromMemberId: original.toMemberId,
      toMemberId: original.fromMemberId,
      amount: original.amountCents / 100,
      note: original.note ? `Undo: ${original.note}` : "Undo of payment",
      occurredOn: todayIso(),
    },
    paymentId,
  );
}

export async function deletePayment(paymentId: number) {
  const deleted = await db.delete(payments).where(eq(payments.id, paymentId)).returning();
  if (deleted.length === 0) throw new ApiError("Payment not found", 404);
  return deleted[0];
}

/** Records every transfer of a simplified plan in one shot. */
export async function settlePlan(groupId: number) {
  const { getGroupDetail } = await import("./queries");
  const detail = await getGroupDetail(groupId);
  if (!detail) throw new ApiError("Group not found", 404);

  const rows = detail.plan.transfers
    .filter((transfer) => transfer.amountCents > 0)
    .map((transfer) => ({
      groupId,
      fromMemberId: transfer.fromMemberId,
      toMemberId: transfer.toMemberId,
      amountCents: transfer.amountCents,
      note: "Simplified settle-up",
      occurredOn: new Date().toISOString().slice(0, 10),
    }));

  if (rows.length === 0) throw new ApiError("Nothing to settle in this group");
  return db.insert(payments).values(rows).returning();
}

function personKey(name: string) {
  return name.trim().toLowerCase();
}

function orderedPeople(a: string, b: string) {
  return [
    { key: personKey(a), name: a.trim() },
    { key: personKey(b), name: b.trim() },
  ].sort((left, right) => left.key.localeCompare(right.key)) as [
    { key: string; name: string },
    { key: string; name: string },
  ];
}

export async function addTransferRestriction(input: { personAName: unknown; personBName: unknown }) {
  const personAName = requireText(input.personAName, "First person", 120);
  const personBName = requireText(input.personBName, "Second person", 120);
  if (personKey(personAName) === personKey(personBName)) {
    throw new ApiError("Choose two different people");
  }

  const allMembers = await db.select().from(members);
  const known = new Set(allMembers.map((member) => personKey(member.name)));
  if (!known.has(personKey(personAName)) || !known.has(personKey(personBName))) {
    throw new ApiError("Both people must exist in one of your groups");
  }

  const [first, second] = orderedPeople(personAName, personBName);
  const existing = await db
    .select()
    .from(transferRestrictions)
    .where(
      and(
        eq(transferRestrictions.personAKey, first.key),
        eq(transferRestrictions.personBKey, second.key),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(transferRestrictions)
    .values({
      personAKey: first.key,
      personAName: first.name,
      personBKey: second.key,
      personBName: second.name,
    })
    .returning();
  return created;
}

export async function deleteTransferRestriction(restrictionId: number) {
  const deleted = await db
    .delete(transferRestrictions)
    .where(eq(transferRestrictions.id, restrictionId))
    .returning();
  if (deleted.length === 0) throw new ApiError("Restriction not found", 404);
  return deleted[0];
}

async function ensureMemberInGroup(
  groupId: number,
  source: { name: string; isSelf: boolean; email: string | null },
) {
  const existing = await db.select().from(members).where(eq(members.groupId, groupId));
  const match = existing.find((row) => personKey(row.name) === personKey(source.name));
  if (match) return match;
  const [created] = await db
    .insert(members)
    .values({
      groupId,
      name: source.name,
      email: source.email,
      isSelf: source.isSelf && !existing.some((row) => row.isSelf),
    })
    .returning();
  return created;
}

/** Record a combined-view transfer as a real payment in a shared (or new) group. */
export async function recordCombinedTransfer(input: {
  fromName: unknown;
  toName: unknown;
  amount: unknown;
}) {
  const fromName = requireText(input.fromName, "Payer");
  const toName = requireText(input.toName, "Payee");
  if (personKey(fromName) === personKey(toName)) {
    throw new ApiError("Pick two different people");
  }
  const amountCents = centsFromInput(input.amount);
  if (amountCents == null || amountCents <= 0) {
    throw new ApiError("Amount must be greater than zero");
  }

  const allMembers = await db.select().from(members);
  const fromPeople = allMembers.filter((row) => personKey(row.name) === personKey(fromName));
  const toPeople = allMembers.filter((row) => personKey(row.name) === personKey(toName));
  if (fromPeople.length === 0 || toPeople.length === 0) {
    throw new ApiError("Could not find both people across your groups");
  }

  const fromGroups = new Set(fromPeople.map((row) => row.groupId));
  const sharedTo = toPeople.find((row) => fromGroups.has(row.groupId));

  let groupId: number;
  let fromMemberId: number;
  let toMemberId: number;

  if (sharedTo) {
    groupId = sharedTo.groupId;
    fromMemberId = fromPeople.find((row) => row.groupId === groupId)!.id;
    toMemberId = sharedTo.id;
  } else {
    const CROSS_NAME = "Cross-group settle";
    const existingGroups = await db.select().from(groups);
    let cross = existingGroups.find((row) => row.name === CROSS_NAME);
    if (!cross) {
      const currency = existingGroups[0]?.currency ?? "USD";
      [cross] = await db
        .insert(groups)
        .values({
          name: CROSS_NAME,
          description: "Payments that settle combined balances across groups.",
          currency,
        })
        .returning();
    }
    groupId = cross.id;
    const fromSource = fromPeople.find((row) => row.isSelf) ?? fromPeople[0];
    const toSource = toPeople.find((row) => row.isSelf) ?? toPeople[0];
    const fromMember = await ensureMemberInGroup(groupId, fromSource);
    const toMember = await ensureMemberInGroup(groupId, toSource);
    fromMemberId = fromMember.id;
    toMemberId = toMember.id;
  }

  return createPayment(groupId, {
    fromMemberId,
    toMemberId,
    amount: amountCents / 100,
    note: "Combined settle-up",
    occurredOn: todayIso(),
  });
}

export async function recordCombinedTransfers(
  items: { fromName: unknown; toName: unknown; amount: unknown }[],
) {
  if (items.length === 0) throw new ApiError("Nothing to record");
  const recorded = [];
  for (const item of items) {
    recorded.push(await recordCombinedTransfer(item));
  }
  return recorded;
}

export async function seedDemoData() {
  const existing = await db.select({ id: groups.id }).from(groups).limit(1);
  if (existing.length > 0) throw new ApiError("Demo data can only be added to an empty workspace");

  const [trip] = await db
    .insert(groups)
    .values({
      name: "Lisbon Trip",
      description: "Four friends, five days, one very confusing bill pile.",
      currency: "USD",
    })
    .returning();

  const [flat] = await db
    .insert(groups)
    .values({
      name: "Flat 12B",
      description: "Monthly rent, groceries and utilities.",
      currency: "USD",
    })
    .returning();

  const tripMembers = await db
    .insert(members)
    .values([
      { groupId: trip.id, name: "You", isSelf: true },
      { groupId: trip.id, name: "Maya" },
      { groupId: trip.id, name: "Dev" },
      { groupId: trip.id, name: "Sara" },
    ])
    .returning();

  const flatMembers = await db
    .insert(members)
    .values([
      { groupId: flat.id, name: "You", isSelf: true },
      { groupId: flat.id, name: "Priya" },
      { groupId: flat.id, name: "Tom" },
    ])
    .returning();

  const day = (offset: number) =>
    new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

  const tripBy = (name: string) => tripMembers.find((m) => m.name === name)!.id;
  const flatBy = (name: string) => flatMembers.find((m) => m.name === name)!.id;

  const tripEntries: {
    kind: "expense" | "debt";
    description: string;
    amountCents: number;
    paidById: number;
    debtorId?: number;
    participants: number[];
    occurredOn: string;
    splitMode: string;
  }[] = [
    {
      kind: "expense",
      description: "Airbnb (4 nights)",
      amountCents: 92400,
      paidById: tripBy("You"),
      participants: tripMembers.map((m) => m.id),
      occurredOn: day(9),
      splitMode: "equal",
    },
    {
      kind: "expense",
      description: "Seafood dinner",
      amountCents: 18650,
      paidById: tripBy("Maya"),
      participants: [tripBy("You"), tripBy("Maya"), tripBy("Dev")],
      occurredOn: day(7),
      splitMode: "equal",
    },
    {
      kind: "expense",
      description: "Surfboard rental",
      amountCents: 12000,
      paidById: tripBy("Dev"),
      participants: [tripBy("Dev"), tripBy("Sara")],
      occurredOn: day(6),
      splitMode: "equal",
    },
    {
      kind: "debt",
      description: "Taxi to airport (Maya covered it)",
      amountCents: 4200,
      paidById: tripBy("Sara"),
      debtorId: tripBy("You"),
      participants: [],
      occurredOn: day(5),
      splitMode: "exact",
    },
    {
      kind: "expense",
      description: "Groceries + pastries",
      amountCents: 7350,
      paidById: tripBy("Sara"),
      participants: tripMembers.map((m) => m.id),
      occurredOn: day(5),
      splitMode: "equal",
    },
  ];

  for (const entry of tripEntries) {
    const [created] = await db
      .insert(expenses)
      .values({
        groupId: trip.id,
        kind: entry.kind,
        description: entry.description,
        amountCents: entry.amountCents,
        paidById: entry.paidById,
        splitMode: entry.kind === "debt" ? "exact" : entry.splitMode,
        occurredOn: entry.occurredOn,
      })
      .returning();

    const shares =
      entry.kind === "debt"
        ? [{ memberId: entry.debtorId!, amountCents: entry.amountCents }]
        : splitEqually(entry.amountCents, entry.participants.length).map((amountCents, i) => ({
            memberId: entry.participants[i],
            amountCents,
          }));

    await db
      .insert(expenseShares)
      .values(shares.map((share) => ({ ...share, expenseId: created.id })));
  }

  const rentTotal = 240000;
  const [rent] = await db
    .insert(expenses)
    .values({
      groupId: flat.id,
      kind: "expense",
      description: "October rent",
      amountCents: rentTotal,
      paidById: flatBy("Priya"),
      splitMode: "exact",
      occurredOn: day(12),
    })
    .returning();
  await db.insert(expenseShares).values([
    { expenseId: rent.id, memberId: flatBy("You"), amountCents: 80000 },
    { expenseId: rent.id, memberId: flatBy("Priya"), amountCents: 80000 },
    { expenseId: rent.id, memberId: flatBy("Tom"), amountCents: 80000 },
  ]);

  const [wifi] = await db
    .insert(expenses)
    .values({
      groupId: flat.id,
      kind: "expense",
      description: "Fibre wifi",
      amountCents: 6500,
      paidById: flatBy("Tom"),
      splitMode: "equal",
      occurredOn: day(11),
    })
    .returning();
  await db.insert(expenseShares).values(
    flatMembers.map((member, index) => ({
      expenseId: wifi.id,
      memberId: member.id,
      amountCents: splitEqually(6500, 3)[index],
    })),
  );

  await db.insert(payments).values([
    {
      groupId: flat.id,
      fromMemberId: flatBy("Tom"),
      toMemberId: flatBy("Priya"),
      amountCents: 80000,
      note: "Bank transfer for rent",
      occurredOn: day(10),
    },
    {
      groupId: trip.id,
      fromMemberId: tripBy("Dev"),
      toMemberId: tripBy("You"),
      amountCents: 6000,
      note: "Partial payback",
      occurredOn: day(4),
    },
  ]);

  return { groups: [trip, flat] };
}

export async function resetWorkspace() {
  await db.delete(expenseShares);
  await db.delete(expenses);
  await db.delete(payments);
  await db.delete(members);
  await db.delete(groups);
}

export async function groupsExist() {
  const rows = await db.select({ id: groups.id }).from(groups).limit(1);
  return rows.length > 0;
}

export async function membersInGroups(groupIds: number[]) {
  if (groupIds.length === 0) return [];
  return db.select().from(members).where(inArray(members.groupId, groupIds));
}
