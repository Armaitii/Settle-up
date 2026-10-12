"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DeleteButton,
  EditEntryModal,
  EditGroupModal,
  EditMemberModal,
  EditPaymentModal,
  UndoButton,
} from "./forms";
import { Avatar, Badge, Card, EmptyState, cn } from "./ui";
import { formatCents } from "@/lib/money";
import type { HistoryItem } from "@/lib/queries";

type MemberLite = { id: number; name: string; isSelf: boolean; email: string | null };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expenses" },
  { id: "debt", label: "Debts" },
  { id: "payment", label: "Payments" },
  { id: "member", label: "People" },
  { id: "group", label: "Groups" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HistoryView({
  items,
  membersByGroup,
}: {
  items: HistoryItem[];
  membersByGroup: Record<number, MemberLite[]>;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");

  const marked = useMemo(() => new Set(items.map((item) => item.date)), [items]);

  const visible = items.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    if (selectedDate && item.date !== selectedDate) return false;
    return true;
  });

  const countsOnSelected = selectedDate
    ? items.filter((item) => item.date === selectedDate).length
    : items.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={() =>
              setCursor((prev) =>
                prev.month === 0
                  ? { year: prev.year - 1, month: 11 }
                  : { year: prev.year, month: prev.month - 1 },
              )
            }
          >
            ‹
          </button>
          <p className="text-sm font-semibold text-slate-800">
            {new Date(cursor.year, cursor.month, 1).toLocaleString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={() =>
              setCursor((prev) =>
                prev.month === 11
                  ? { year: prev.year + 1, month: 0 }
                  : { year: prev.year, month: prev.month + 1 },
              )
            }
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {buildCells(cursor.year, cursor.month).map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} />;
            const iso = toIsoDate(cursor.year, cursor.month, cell);
            const has = marked.has(iso);
            const selected = selectedDate === iso;
            const isToday = iso === toIsoDate(today.getFullYear(), today.getMonth(), today.getDate());
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate((prev) => (prev === iso ? null : iso))}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded-lg text-sm transition",
                  selected && "bg-indigo-600 font-semibold text-white",
                  !selected && has && "bg-indigo-50 font-medium text-indigo-800 hover:bg-indigo-100",
                  !selected && !has && "text-slate-600 hover:bg-slate-100",
                  isToday && !selected && "ring-1 ring-indigo-300",
                )}
              >
                {cell}
                {has && !selected ? (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-500" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            {selectedDate
              ? `${countsOnSelected} event${countsOnSelected === 1 ? "" : "s"} on ${selectedDate}`
              : `${items.length} events in total`}
          </span>
          {selectedDate ? (
            <button
              type="button"
              className="font-semibold text-indigo-600 hover:text-indigo-800"
              onClick={() => setSelectedDate(null)}
            >
              Show all dates
            </button>
          ) : null}
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                filter === item.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="📅"
            title="Nothing on this date"
            description="Pick another day on the calendar, or clear the date filter to see the full ledger."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((item) => (
              <HistoryCard key={item.key} item={item} membersByGroup={membersByGroup} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryCard({
  item,
  membersByGroup,
}: {
  item: HistoryItem;
  membersByGroup: Record<number, MemberLite[]>;
}) {
  const members = item.groupId ? (membersByGroup[item.groupId] ?? []) : [];
  const icon =
    item.kind === "payment"
      ? "💸"
      : item.kind === "debt"
        ? "🤝"
        : item.kind === "expense"
          ? "🧾"
          : item.kind === "member"
            ? "👤"
            : "👥";

  return (
    <Card className={cn("p-4", item.kind === "payment" && "border-emerald-200 bg-emerald-50/40")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-base">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-800">{item.title}</p>
            <Badge
              tone={
                item.kind === "payment"
                  ? "emerald"
                  : item.kind === "debt"
                    ? "amber"
                    : item.kind === "expense"
                      ? "slate"
                      : "indigo"
              }
            >
              {item.kind}
            </Badge>
            {item.isReversal ? <Badge tone="amber">undo</Badge> : null}
            <Badge tone="slate">{item.date}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{item.summary}</p>
          {item.groupName && item.groupId ? (
            <Link
              href={`/groups/${item.groupId}`}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {item.groupName} →
            </Link>
          ) : null}
        </div>
        {item.amountCents != null ? (
          <span className="font-semibold tabular-nums text-slate-900">
            {formatCents(item.amountCents, item.currency)}
          </span>
        ) : (
          <Avatar name={item.member?.name ?? item.groupName ?? "G"} size="sm" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
        {item.expense ? (
          <>
            <EditEntryModal groupId={item.expense.groupId} members={members} expense={item.expense} />
            {item.undoable ? <UndoButton url={`/api/expenses/${item.expense.id}/undo`} /> : null}
            <DeleteButton
              url={`/api/expenses/${item.expense.id}`}
              confirmMessage="Delete this entry?"
            />
          </>
        ) : null}
        {item.payment ? (
          <>
            <EditPaymentModal
              groupId={item.payment.groupId}
              members={members}
              payment={item.payment}
            />
            {item.undoable ? (
              <UndoButton
                url={`/api/payments/${item.payment.id}/undo`}
                hint="Records the opposite payment (the recipient pays the original payer)."
              />
            ) : null}
            <DeleteButton
              url={`/api/payments/${item.payment.id}`}
              confirmMessage="Delete this payment?"
            />
          </>
        ) : null}
        {item.member ? <EditMemberModal member={item.member} /> : null}
        {item.group ? <EditGroupModal group={item.group} compact /> : null}
      </div>
    </Card>
  );
}

function buildCells(year: number, month: number) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  return cells;
}

function toIsoDate(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
