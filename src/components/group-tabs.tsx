"use client";

import { useState } from "react";
import type { ExpenseView, PaymentView } from "@/lib/queries";
import type { MemberBalance, PairDebt, SettlePlan } from "@/lib/settle";
import { formatCents } from "@/lib/money";
import {
  AddMemberForm,
  AddPaymentModal,
  DeleteButton,
  EditEntryModal,
  EditMemberModal,
  EditPaymentModal,
  SettleAllButton,
  UndoButton,
} from "./forms";
import { Avatar, Badge, Card, EmptyState, cn } from "./ui";

export type GroupTabData = {
  groupId: number;
  currency: string;
  groupName: string;
  members: { id: number; name: string; isSelf: boolean; email: string | null }[];
  balances: MemberBalance[];
  pairDebts: PairDebt[];
  plan: SettlePlan;
  expenses: ExpenseView[];
  payments: PaymentView[];
};

const TABS = [
  { id: "balances", label: "Balances" },
  { id: "debts", label: "Who owes whom" },
  { id: "settle", label: "Settle up" },
  { id: "activity", label: "Activity" },
  { id: "people", label: "People" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function GroupTabs({ data }: { data: GroupTabData }) {
  const [tab, setTab] = useState<TabId>("balances");
  const currency = data.currency;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((item) => {
          const count =
            item.id === "debts"
              ? data.pairDebts.length
              : item.id === "settle"
                ? data.plan.transactionCount
                : item.id === "activity"
                  ? data.expenses.length + data.payments.length
                  : item.id === "people"
                    ? data.members.length
                    : null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                tab === item.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              )}
            >
              {item.label}
              {count != null && count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    tab === item.id ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "balances" ? <BalancesTab data={data} /> : null}
      {tab === "debts" ? <DebtsTab data={data} /> : null}
      {tab === "settle" ? <SettleTab data={data} /> : null}
      {tab === "activity" ? <ActivityTab data={data} /> : null}
      {tab === "people" ? <PeopleTab data={data} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------- balances */

function BalancesTab({ data }: { data: GroupTabData }) {
  const currency = data.currency;
  const max = Math.max(1, ...data.balances.map((b) => Math.abs(b.netCents)));

  if (data.balances.length === 0) {
    return <EmptyState icon="👥" title="No people yet" description="Add someone to the group first." />;
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold tracking-tight">Group balances</h3>
        <p className="text-sm text-slate-500">
          Positive means the group owes them. Negative means they owe the group.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {data.balances.map((member) => (
          <div key={member.memberId} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-slate-800">
                  {member.isSelf ? "You" : member.name}
                  {member.isSelf ? <Badge tone="indigo">you</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  paid {formatCents(member.paidCents, currency)} · owes{" "}
                  {formatCents(member.owedCents, currency)}
                  {member.sentCents > 0 || member.receivedCents > 0
                    ? ` · repaid ${formatCents(member.sentCents, currency)} / received ${formatCents(
                        member.receivedCents,
                        currency,
                      )}`
                    : ""}
                </p>
              </div>
              <div className="w-full max-w-[220px]">
                <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      member.netCents > 0
                        ? "left-1/2 bg-emerald-500"
                        : "right-1/2 bg-rose-500",
                    )}
                    style={{
                      width: `${(Math.abs(member.netCents) / max) * 50}%`,
                    }}
                  />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                </div>
              </div>
              <p
                className={cn(
                  "w-24 text-right text-sm font-semibold tabular-nums",
                  member.netCents === 0
                    ? "text-slate-400"
                    : member.netCents > 0
                      ? "text-emerald-600"
                      : "text-rose-600",
                )}
              >
                {member.netCents === 0
                  ? "settled"
                  : formatCents(Math.abs(member.netCents), currency)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
        net = paid − owed + repaid − received. The settle-up tab turns these nets into the fewest
        possible payments.
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- debts */

function DebtsTab({ data }: { data: GroupTabData }) {
  if (data.pairDebts.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="Nobody owes anybody"
        description="Once you log expenses, direct debts and payments, the raw pair-by-pair obligations show up here."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-semibold tracking-tight">Raw obligations (pair by pair)</h3>
        <p className="text-sm text-slate-500">
          These are the literal “A owes B” amounts before simplification.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {data.pairDebts.map((debt, index) => (
          <div
            key={`${debt.debtorId}-${debt.creditorId}-${index}`}
            className="flex flex-wrap items-center gap-3 px-5 py-3.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar name={debt.debtorName} size="sm" />
              <span className="truncate font-medium text-slate-800">
                {debt.debtorIsSelf ? "You" : debt.debtorName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <span>owes</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <span className="truncate font-medium text-slate-800">
                {debt.creditorIsSelf ? "you" : debt.creditorName}
              </span>
              <Avatar name={debt.creditorName} size="sm" />
            </div>
            <p className="w-24 text-right font-semibold tabular-nums text-slate-900">
              {formatCents(debt.amountCents, data.currency)}
            </p>
            <AddPaymentModal
              groupId={data.groupId}
              members={data.members}
              presetFrom={debt.debtorId}
              presetTo={debt.creditorId}
              presetAmount={debt.amountCents}
              label="A paid B"
              variant="subtle"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- settle */

function SettleTab({ data }: { data: GroupTabData }) {
  const { plan, currency } = data;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold tracking-tight">
              Simplified settlement plan
              {plan.transactionCount === 0 ? " — everything is clear" : ""}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {plan.transactionCount === 0
                ? "No money needs to change hands in this group."
                : `Only ${plan.transactionCount} transfer${
                    plan.transactionCount === 1 ? "" : "s"
                  } needed${
                    plan.savedTransactions > 0
                      ? ` instead of ${plan.rawObligationCount} pair-by-pair payments`
                      : ""
                  }.`}
            </p>
          </div>
          <SettleAllButton groupId={data.groupId} count={plan.transactionCount} />
        </div>

        <div className="mt-5 space-y-2.5">
          {plan.transfers.map((transfer, index) => (
            <div
              key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}`}
              className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-white p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-indigo-600 shadow-sm">
                  #{index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <Avatar name={transfer.fromName} size="sm" />
                  <span className="font-semibold text-slate-800">
                    {transfer.fromIsSelf ? "You pay" : `${transfer.fromName} pays`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar name={transfer.toName} size="sm" />
                  <span className="font-semibold text-slate-800">
                    {transfer.toIsSelf ? "you" : transfer.toName}
                  </span>
                </div>
                <span className="ml-auto text-lg font-bold tabular-nums text-indigo-700">
                  {formatCents(transfer.amountCents, currency)}
                </span>
              </div>
              <div className="mt-2 flex justify-end">
                <AddPaymentModal
                  groupId={data.groupId}
                  members={data.members}
                  presetFrom={transfer.fromMemberId}
                  presetTo={transfer.toMemberId}
                  presetAmount={transfer.amountCents}
                  label="Mark as paid"
                  variant="ghost"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="font-semibold tracking-tight text-slate-800">How this is calculated</h4>
        <ol className="mt-3 space-y-2.5 text-sm text-slate-600">
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
              1
            </span>
            <span>
              Every expense, direct debt and payment is collapsed into one <strong>net</strong>{" "}
              figure per person: what they paid out minus what they consumed, plus anything they
              already repaid.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
              2
            </span>
            <span>
              People whose nets cancel each other out are grouped into independent clusters, so they
              never send money to the rest of the group.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
              3
            </span>
            <span>
              Inside each cluster the biggest debtor pays the biggest creditor repeatedly. Every
              transfer retires at least one person, so a cluster of <em>k</em> people needs at most{" "}
              <em>k − 1</em> transfers.
            </span>
          </li>
        </ol>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- activity */

function ActivityTab({ data }: { data: GroupTabData }) {
  const currency = data.currency;
  type Item =
    | { type: "expense"; date: string; view: ExpenseView }
    | { type: "payment"; date: string; view: PaymentView };

  const items: Item[] = [
    ...data.expenses.map((view) => ({ type: "expense" as const, date: view.occurredOn, view })),
    ...data.payments.map((view) => ({ type: "payment" as const, date: view.occurredOn, view })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (items.length === 0) {
    return (
      <EmptyState
        icon="📝"
        title="Nothing logged yet"
        description="Add a shared expense or a direct “A owes B” debt to get started."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) =>
        item.type === "expense" ? (
          <Card key={`e-${item.view.id}`} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-base">
                {item.view.kind === "debt" ? "🤝" : "🧾"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{item.view.description}</p>
                  <Badge tone={item.view.kind === "debt" ? "amber" : "slate"}>
                    {item.view.kind === "debt" ? "direct debt" : "split expense"}
                  </Badge>
                  <Badge tone="slate">{item.view.occurredOn}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {item.view.kind === "debt" ? (
                    <>
                      <strong className="text-slate-700">
                        {item.view.shares[0]
                          ? item.view.shares[0].isSelf
                            ? "You"
                            : item.view.shares[0].name
                          : "Someone"}
                      </strong>{" "}
                      owes{" "}
                      <strong className="text-slate-700">
                        {item.view.paidByIsSelf ? "you" : item.view.paidByName}
                      </strong>
                    </>
                  ) : (
                    <>
                      <strong className="text-slate-700">
                        {item.view.paidByIsSelf ? "You" : item.view.paidByName}
                      </strong>{" "}
                      paid · {item.view.splitMode === "exact" ? "custom split" : "split equally"}
                    </>
                  )}
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.view.shares.map((share) => (
                    <span
                      key={share.memberId}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {share.isSelf ? "You" : share.name}
                      <span className="font-semibold tabular-nums">
                        {formatCents(share.amountCents, currency)}
                      </span>
                    </span>
                  ))}
                </p>
                {item.view.notes ? (
                  <p className="mt-2 text-xs italic text-slate-400">{item.view.notes}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatCents(item.view.amountCents, currency)}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  <EditEntryModal
                    groupId={data.groupId}
                    members={data.members}
                    expense={item.view}
                  />
                  {item.view.reversesId ? (
                    <Badge tone="amber">undo</Badge>
                  ) : (
                    <UndoButton url={`/api/expenses/${item.view.id}/undo`} />
                  )}
                  <DeleteButton
                    url={`/api/expenses/${item.view.id}`}
                    confirmMessage="Delete this entry?"
                  />
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card key={`p-${item.view.id}`} className="border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-base">
                💸
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">
                  {item.view.fromIsSelf ? "You" : item.view.fromName} paid{" "}
                  {item.view.toIsSelf ? "you" : item.view.toName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.view.occurredOn}
                  {item.view.note ? ` · ${item.view.note}` : ""}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-emerald-700">
                {formatCents(item.view.amountCents, currency)}
              </span>
              <EditPaymentModal
                groupId={data.groupId}
                members={data.members}
                payment={item.view}
              />
              {item.view.reversesId ? (
                <Badge tone="amber">undo</Badge>
              ) : (
                <UndoButton url={`/api/payments/${item.view.id}/undo`} />
              )}
              <DeleteButton
                url={`/api/payments/${item.view.id}`}
                confirmMessage="Delete this payment?"
              />
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

/* --------------------------------------------------------------- people */

function PeopleTab({ data }: { data: GroupTabData }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold tracking-tight">Add someone to this group</h3>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">
          Only people in the group can be part of a calculation here.
        </p>
        <AddMemberForm groupId={data.groupId} />
      </Card>

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-100">
          {data.members.map((member) => {
            const balance = data.balances.find((b) => b.memberId === member.id);
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-slate-800">
                    {member.name}
                    {member.isSelf ? <Badge tone="indigo">you</Badge> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {balance
                      ? balance.netCents === 0
                        ? "settled up"
                        : balance.netCents > 0
                          ? `gets back ${formatCents(balance.netCents, data.currency)}`
                          : `owes ${formatCents(Math.abs(balance.netCents), data.currency)}`
                      : "no activity"}
                  </p>
                </div>
                <EditMemberModal member={member} />
                <DeleteButton
                  url={`/api/members/${member.id}`}
                  confirmMessage="Remove this person?"
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
