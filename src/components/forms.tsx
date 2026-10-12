"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CURRENCIES, formatCents, todayIso } from "@/lib/money";
import type { ExpenseView, PaymentView } from "@/lib/queries";
import { Button, ErrorNote, Field, Modal, inputClass } from "./client";
import { Avatar, Badge, cn } from "./ui";

export type MemberOption = { id: number; name: string; isSelf: boolean; email?: string | null };

function useApi() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — please try again");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { error, busy, call, setError };
}

/* ------------------------------------------------------------------ groups */

export function CreateGroupForm({ currencies }: { currencies: string[] }) {
  const { error, busy, call } = useApi();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "USD");
  const [yourName, setYourName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberList, setMemberList] = useState<string[]>([]);

  function addMember() {
    const values = memberInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    setMemberList((prev) => {
      const next = [...prev];
      for (const value of values) {
        if (!next.some((m) => m.toLowerCase() === value.toLowerCase())) next.push(value);
      }
      return next.slice(0, 39);
    });
    setMemberInput("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call("/api/groups", "POST", {
      name,
      description,
      currency,
      yourName,
      memberNames: memberList,
    });
    if (ok) {
      setName("");
      setDescription("");
      setYourName("");
      setMemberList([]);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Group name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lisbon trip, Flat 12B, Family…"
            required
          />
        </Field>
        <Field label="Currency">
          <select
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description" hint="Optional context for the group.">
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Five days, one very confusing bill pile"
        />
      </Field>

      <Field label="Your name" hint="Balances will be shown from your point of view.">
        <input
          className={inputClass}
          value={yourName}
          onChange={(e) => setYourName(e.target.value)}
          placeholder="You"
          required
        />
      </Field>

      <Field label="Add people" hint="Press Enter or comma to add. You can add more later.">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={memberInput}
            onChange={(e) => setMemberInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addMember();
              }
            }}
            placeholder="Maya, Dev, Sara…"
          />
          <Button type="button" variant="ghost" onClick={addMember}>
            Add
          </Button>
        </div>
      </Field>

      {memberList.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {memberList.map((member) => (
            <span
              key={member}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-sm"
            >
              <Avatar name={member} size="sm" />
              {member}
              <button
                type="button"
                className="text-slate-400 transition hover:text-rose-500"
                onClick={() =>
                  setMemberList((prev) => prev.filter((m) => m !== member))
                }
                aria-label={`Remove ${member}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <ErrorNote message={error} />
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- expenses */

function dollarsFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export function AddEntryForm({
  groupId,
  members,
  close,
  expenseId,
  initial,
}: {
  groupId: number;
  members: MemberOption[];
  close: () => void;
  expenseId?: number;
  initial?: ExpenseView;
}) {
  const { error, busy, call } = useApi();
  const [kind, setKind] = useState<"expense" | "debt">(
    initial?.kind === "debt" ? "debt" : "expense",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(
    initial ? dollarsFromCents(initial.amountCents) : "",
  );
  const [paidById, setPaidById] = useState<number>(initial?.paidById ?? members[0]?.id ?? 0);
  const [debtorId, setDebtorId] = useState<number>(
    initial?.kind === "debt"
      ? (initial.shares[0]?.memberId ?? members[0]?.id ?? 0)
      : (members.find((m) => !m.isSelf)?.id ?? members[0]?.id ?? 0),
  );
  const [splitMode, setSplitMode] = useState<"equal" | "exact">(
    initial?.splitMode === "exact" ? "exact" : "equal",
  );
  const [participants, setParticipants] = useState<number[]>(
    initial ? initial.shares.map((share) => share.memberId) : members.map((m) => m.id),
  );
  const [exact, setExact] = useState<Record<string, string>>(
    initial
      ? Object.fromEntries(
          initial.shares.map((share) => [String(share.memberId), dollarsFromCents(share.amountCents)]),
        )
      : {},
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? todayIso());

  const amountCents = Math.round((Number(amount) || 0) * 100);
  const exactSum = useMemo(
    () =>
      Object.values(exact).reduce((acc, value) => acc + Math.round((Number(value) || 0) * 100), 0),
    [exact],
  );
  const remaining = amountCents - exactSum;
  const creditorName = members.find((m) => m.id === paidById)?.name ?? "—";

  function toggleParticipant(id: number) {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      kind,
      description,
      amount,
      paidById,
      notes,
      occurredOn,
    };
    if (kind === "debt") {
      payload.debtorId = debtorId;
    } else {
      payload.splitMode = splitMode;
      payload.participantIds = participants;
      if (splitMode === "exact") payload.exactAmounts = exact;
    }
    const ok = expenseId
      ? await call(`/api/expenses/${expenseId}`, "PATCH", payload)
      : await call(`/api/groups/${groupId}/expenses`, "POST", payload);
    if (ok) close();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {(
          [
            { value: "expense", label: "Split an expense" },
            { value: "debt", label: "A owes B" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              kind === option.value
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Field
        label={kind === "debt" ? "What is this debt for?" : "What was it for?"}
      >
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === "debt" ? "Taxi to airport" : "Airbnb (4 nights)"}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>
      </div>

      {kind === "debt" ? (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-sm text-amber-800">
            This records a direct obligation between two people, without splitting it.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who owes?">
              <select
                className={inputClass}
                value={debtorId}
                onChange={(e) => setDebtorId(Number(e.target.value))}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.isSelf ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Who is owed?">
              <select
                className={inputClass}
                value={paidById}
                onChange={(e) => setPaidById(Number(e.target.value))}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.isSelf ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-sm font-medium text-amber-900">
            {members.find((m) => m.id === debtorId)?.name ?? "A"} owes {creditorName}{" "}
            {amount ? formatCents(amountCents) : "—"}
          </p>
        </div>
      ) : (
        <>
          <Field label="Who paid?">
            <select
              className={inputClass}
              value={paidById}
              onChange={(e) => setPaidById(Number(e.target.value))}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.isSelf ? " (you)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Split between
              </span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
                {(
                  [
                    { value: "equal", label: "Equally" },
                    { value: "exact", label: "Custom" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSplitMode(option.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                      splitMode === option.value
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-500",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {members.map((member) => {
                const selected = participants.includes(member.id);
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition",
                      selected ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      checked={selected}
                      onChange={() => toggleParticipant(member.id)}
                    />
                    <Avatar name={member.name} size="sm" />
                    <span className="flex-1 text-sm font-medium text-slate-700">
                      {member.name}
                      {member.isSelf ? " (you)" : ""}
                    </span>
                    {splitMode === "exact" && selected ? (
                      <input
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-indigo-500"
                        value={exact[String(member.id)] ?? ""}
                        onChange={(e) =>
                          setExact((prev) => ({ ...prev, [String(member.id)]: e.target.value }))
                        }
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    ) : selected && splitMode === "equal" ? (
                      <span className="text-sm tabular-nums text-slate-500">
                        {formatCents(
                          participants.length > 0 ? Math.round(amountCents / participants.length) : 0,
                        )}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {splitMode === "exact" ? (
              <p
                className={cn(
                  "mt-2 text-sm font-medium tabular-nums",
                  remaining === 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {remaining === 0
                  ? "Shares match the total ✓"
                  : `${formatCents(Math.abs(remaining))} ${
                      remaining > 0 ? "left to allocate" : "over allocated"
                    }`}
              </p>
            ) : null}
          </div>
        </>
      )}

      <Field label="Notes" hint="Optional.">
        <input
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paid by card, keep the receipt…"
        />
      </Field>

      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : expenseId ? "Save changes" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}

export function AddEntryModal({
  groupId,
  members,
  label = "Add expense",
  variant = "primary",
}: {
  groupId: number;
  members: MemberOption[];
  label?: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <Modal
      wide
      title="Add money to the group"
      description="Split a shared expense, or record a direct “A owes B” debt."
      trigger={
        <Button variant={variant} size="md">
          + {label}
        </Button>
      }
    >
      {(close) => (
        <AddEntryForm groupId={groupId} members={members} close={close} />
      )}
    </Modal>
  );
}

export function EditEntryModal({
  groupId,
  members,
  expense,
}: {
  groupId: number;
  members: MemberOption[];
  expense: ExpenseView;
}) {
  return (
    <Modal
      wide
      title="Edit entry"
      description="Change the people, amount, split or date. Balances update immediately."
      trigger={
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
        >
          Edit
        </button>
      }
    >
      {(close) => (
        <AddEntryForm
          groupId={groupId}
          members={members}
          close={close}
          expenseId={expense.id}
          initial={expense}
        />
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- payments */

export function PaymentForm({
  groupId,
  members,
  close,
  presetFrom,
  presetTo,
  presetAmount,
  paymentId,
  initialNote,
  initialDate,
}: {
  groupId: number;
  members: MemberOption[];
  close: () => void;
  presetFrom?: number;
  presetTo?: number;
  presetAmount?: number;
  paymentId?: number;
  initialNote?: string | null;
  initialDate?: string;
}) {
  const { error, busy, call } = useApi();
  const [fromMemberId, setFromMemberId] = useState(presetFrom ?? members[0]?.id ?? 0);
  const [toMemberId, setToMemberId] = useState(
    presetTo ?? members.find((m) => m.id !== (presetFrom ?? members[0]?.id))?.id ?? 0,
  );
  const [amount, setAmount] = useState(
    presetAmount != null ? (presetAmount / 100).toFixed(2) : "",
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [occurredOn, setOccurredOn] = useState(initialDate ?? todayIso());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { fromMemberId, toMemberId, amount, note, occurredOn };
    const ok = paymentId
      ? await call(`/api/payments/${paymentId}`, "PATCH", payload)
      : await call(`/api/groups/${groupId}/payments`, "POST", payload);
    if (ok) close();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From (paid)">
          <select
            className={inputClass}
            value={fromMemberId}
            onChange={(e) => {
              const value = Number(e.target.value);
              setFromMemberId(value);
              if (value === toMemberId) {
                const other = members.find((m) => m.id !== value);
                if (other) setToMemberId(other.id);
              }
            }}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.isSelf ? " (you)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To (received)">
          <select
            className={inputClass}
            value={toMemberId}
            onChange={(e) => {
              const value = Number(e.target.value);
              setToMemberId(value);
              if (value === fromMemberId) {
                const other = members.find((m) => m.id !== value);
                if (other) setFromMemberId(other.id);
              }
            }}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.isSelf ? " (you)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Note" hint="Optional.">
        <input
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bank transfer, cash at dinner…"
        />
      </Field>

      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : paymentId ? "Save changes" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

export function AddPaymentModal({
  groupId,
  members,
  presetFrom,
  presetTo,
  presetAmount,
  label = "Record a payment",
  variant = "ghost",
}: {
  groupId: number;
  members: MemberOption[];
  presetFrom?: number;
  presetTo?: number;
  presetAmount?: number;
  label?: string;
  variant?: "primary" | "ghost" | "subtle";
}) {
  return (
    <Modal
      title="A pays B"
      description="Money that actually changed hands. This reduces what they owe."
      trigger={
        <Button variant={variant} size="md">
          {label}
        </Button>
      }
    >
      {(close) => (
        <PaymentForm
          groupId={groupId}
          members={members}
          close={close}
          presetFrom={presetFrom}
          presetTo={presetTo}
          presetAmount={presetAmount}
        />
      )}
    </Modal>
  );
}

export function EditPaymentModal({
  groupId,
  members,
  payment,
}: {
  groupId: number;
  members: MemberOption[];
  payment: PaymentView;
}) {
  return (
    <Modal
      title="Edit payment"
      description="Change who paid whom, the amount, or the date."
      trigger={
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
        >
          Edit
        </button>
      }
    >
      {(close) => (
        <PaymentForm
          groupId={groupId}
          members={members}
          close={close}
          presetFrom={payment.fromMemberId}
          presetTo={payment.toMemberId}
          presetAmount={payment.amountCents}
          paymentId={payment.id}
          initialNote={payment.note}
          initialDate={payment.occurredOn}
        />
      )}
    </Modal>
  );
}

export function EditGroupModal({
  group,
  compact = false,
}: {
  group: { id: number; name: string; description: string | null; currency: string };
  compact?: boolean;
}) {
  return (
    <Modal
      title="Edit group"
      description="Rename the group, change its currency, or update the description."
      trigger={
        compact ? (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            Edit
          </button>
        ) : (
          <Button variant="ghost" size="md">
            Edit group
          </Button>
        )
      }
    >
      {(close) => <EditGroupForm group={group} close={close} />}
    </Modal>
  );
}

function EditGroupForm({
  group,
  close,
}: {
  group: { id: number; name: string; description: string | null; currency: string };
  close: () => void;
}) {
  const { error, busy, call } = useApi();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [currency, setCurrency] = useState(group.currency);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call(`/api/groups/${group.id}`, "PATCH", {
      name,
      description,
      currency,
    });
    if (ok) close();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Group name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Currency">
        <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function EditMemberModal({
  member,
}: {
  member: { id: number; name: string; email?: string | null; isSelf: boolean };
}) {
  return (
    <Modal
      title="Edit person"
      description="Change their name, email, or mark them as you."
      trigger={
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
        >
          Edit
        </button>
      }
    >
      {(close) => <EditMemberForm member={member} close={close} />}
    </Modal>
  );
}

function EditMemberForm({
  member,
  close,
}: {
  member: { id: number; name: string; email?: string | null; isSelf: boolean };
  close: () => void;
}) {
  const { error, busy, call } = useApi();
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [isSelf, setIsSelf] = useState(member.isSelf);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call(`/api/members/${member.id}`, "PATCH", { name, email, isSelf });
    if (ok) close();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Email (optional)">
        <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          checked={isSelf}
          onChange={(e) => setIsSelf(e.target.checked)}
        />
        This is me
      </label>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- members */

export function AddMemberForm({ groupId }: { groupId: number }) {
  const { error, busy, call } = useApi();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSelf, setIsSelf] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call(`/api/groups/${groupId}/members`, "POST", {
      name,
      email,
      isSelf,
    });
    if (ok) {
      setName("");
      setEmail("");
      setIsSelf(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <Field label="Name">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New person"
          required
        />
      </Field>
      <Field label="Email (optional)">
        <input
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </Field>
      <label className="flex h-[38px] items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          checked={isSelf}
          onChange={(e) => setIsSelf(e.target.checked)}
        />
        This is me
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add person"}
      </Button>
      <div className="sm:col-span-4">
        <ErrorNote message={error} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ shared */

export function DeleteButton({
  url,
  confirmMessage,
  label = "Delete",
  redirectAfter,
}: {
  url: string;
  confirmMessage: string;
  label?: string;
  redirectAfter?: string;
}) {
  const router = useRouter();
  const { error, busy, call } = useApi();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const ok = await call(url, "DELETE");
    if (ok && redirectAfter) router.push(redirectAfter);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
      >
        {busy ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
      >
        Cancel
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}

export function UndoButton({
  url,
  label = "Undo",
  hint = "This records the opposite transaction instead of deleting the original.",
}: {
  url: string;
  label?: string;
  hint?: string;
}) {
  const { error, busy, call } = useApi();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        title={hint}
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => call(url, "POST")}
        className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-amber-700"
      >
        {busy ? "…" : "Reverse it"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
      >
        Cancel
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}

export function CombinedPayButton({
  fromName,
  toName,
  amountCents,
}: {
  fromName: string;
  toName: string;
  amountCents: number;
}) {
  const { error, busy, call } = useApi();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() =>
          call("/api/combined/settle", "POST", {
            fromName,
            toName,
            amount: amountCents / 100,
          })
        }
      >
        {busy ? "Recording…" : "Mark as paid"}
      </Button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}

export function CombinedPayAllButton({
  transfers,
}: {
  transfers: { fromName: string; toName: string; amountCents: number }[];
}) {
  const { error, busy, call } = useApi();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size="sm"
        disabled={busy || transfers.length === 0}
        onClick={() =>
          call("/api/combined/settle", "POST", {
            transfers: transfers.map((transfer) => ({
              fromName: transfer.fromName,
              toName: transfer.toName,
              amount: transfer.amountCents / 100,
            })),
          })
        }
      >
        {busy ? "Recording…" : `Record all ${transfers.length} payments`}
      </Button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}

export function SettleAllButton({ groupId, count }: { groupId: number; count: number }) {
  const { error, busy, call } = useApi();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size="sm"
        disabled={busy || count === 0}
        onClick={() => call(`/api/groups/${groupId}/settle`, "POST")}
        title="Records every transfer below as a payment"
      >
        {busy ? "Recording…" : `Record all ${count} transfers`}
      </Button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}

export function DemoActions({ hasData }: { hasData: boolean }) {
  const { error, busy, call } = useApi();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hasData ? (
        <Button variant="ghost" disabled={busy} onClick={() => call("/api/demo", "POST")}>
          {busy ? "Loading…" : "Load demo groups"}
        </Button>
      ) : (
        <Modal
          title="Delete everything?"
          description="This removes every group, person, expense and payment."
          trigger={
            <Button variant="danger" disabled={busy}>
              Reset workspace
            </Button>
          }
        >
          {(close) => (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                This is permanent and cannot be undone. All groups, members, expenses, debts and
                payments will be deleted.
              </p>
              <ErrorNote message={error} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>
                  Keep my data
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await call("/api/demo", "DELETE");
                    if (ok) close();
                  }}
                >
                  {busy ? "Deleting…" : "Delete everything"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export function GroupInfo({ currency }: { currency: string }) {
  return <Badge tone="indigo">{currency}</Badge>;
}
