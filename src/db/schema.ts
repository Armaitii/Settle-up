import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * A group is a closed financial universe: members, expenses, debts and
 * payments only ever net against other members of the same group.
 */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    /** Marks the "you" row so the UI can say "you owe / you are owed". */
    isSelf: boolean("is_self").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_group_name_unique").on(table.groupId, table.name),
    index("members_group_idx").on(table.groupId),
  ],
);

/**
 * kind = "expense" -> a bill paid by `paidById` and split across shares.
 * kind = "debt"    -> a direct "A owes B X" record. B is `paidById`,
 *                     and a single share for A of the full amount.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 10 }).notNull().default("expense"),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidById: integer("paid_by_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** equal | exact */
    splitMode: varchar("split_mode", { length: 10 })
      .notNull()
      .default("equal"),
    notes: text("notes"),
    occurredOn: date("occurred_on")
      .notNull()
      .default(sql`CURRENT_DATE`),
    /** When set, this row is the opposite of another expense/debt. */
    reversesId: integer("reverses_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("expenses_group_idx").on(table.groupId)],
);

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: serial("id").primaryKey(),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (table) => [
    index("expense_shares_expense_idx").on(table.expenseId),
    index("expense_shares_member_idx").on(table.memberId),
  ],
);

/**
 * A global restriction used only by the combined-groups settlement view.
 * Canonical keys make the pair unique regardless of which person is chosen first.
 */
export const transferRestrictions = pgTable(
  "transfer_restrictions",
  {
    id: serial("id").primaryKey(),
    personAKey: varchar("person_a_key", { length: 200 }).notNull(),
    personAName: text("person_a_name").notNull(),
    personBKey: varchar("person_b_key", { length: 200 }).notNull(),
    personBName: text("person_b_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("transfer_restrictions_pair_unique").on(table.personAKey, table.personBKey),
  ],
);

/** A settled-up transfer: `fromMemberId` paid `toMemberId`. */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: integer("from_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    toMemberId: integer("to_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    occurredOn: date("occurred_on")
      .notNull()
      .default(sql`CURRENT_DATE`),
    /** When set, this row is the opposite of another payment. */
    reversesId: integer("reverses_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("payments_group_idx").on(table.groupId)],
);

export type GroupRow = typeof groups.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseShareRow = typeof expenseShares.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type TransferRestrictionRow = typeof transferRestrictions.$inferSelect;
