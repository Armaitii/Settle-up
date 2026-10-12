"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Transfer } from "@/lib/settle";
import { formatCents } from "@/lib/money";
import { CombinedPayAllButton, CombinedPayButton } from "./forms";
import { Badge, Card } from "./ui";

type Restriction = {
  id: number;
  personAName: string;
  personBName: string;
};

export function CombinedSettlement({
  transfers,
  restrictions,
  currency,
  usesIntermediary,
  unresolvedMessage,
}: {
  transfers: Transfer[];
  restrictions: Restriction[];
  currency: string;
  usesIntermediary?: boolean;
  unresolvedMessage?: string | null;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            Combine people with the same name across groups and settle their final net balances.
          </p>
          {usesIntermediary ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              This plan uses an intermediary to honor a no-direct-payment rule.
            </p>
          ) : null}
        </div>
        {transfers.length > 0 ? <CombinedPayAllButton transfers={transfers} /> : null}
      </div>

      {unresolvedMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p className="font-semibold">This restriction cannot be settled yet</p>
          <p className="mt-0.5">{unresolvedMessage}</p>
        </div>
      ) : transfers.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Everything is balanced globally.
        </p>
      ) : (
        <div className="space-y-2">
          {transfers.map((transfer, index) => (
            <div
              key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/70 px-3 py-2.5 text-sm"
            >
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-indigo-600 shadow-sm">
                #{index + 1}
              </span>
              <span className="font-semibold text-slate-800">
                {transfer.fromIsSelf ? "You" : transfer.fromName}
              </span>
              <span className="text-slate-500">pay</span>
              <span className="font-semibold text-slate-800">
                {transfer.toIsSelf ? "you" : transfer.toName}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-indigo-700">
                {formatCents(transfer.amountCents, currency)}
              </span>
              <CombinedPayButton
                fromName={transfer.fromName}
                toName={transfer.toName}
                amountCents={transfer.amountCents}
              />
              <BlockPairButton fromName={transfer.fromName} toName={transfer.toName} />
            </div>
          ))}
        </div>
      )}

      <RestrictionList restrictions={restrictions} />
    </Card>
  );
}

function BlockPairButton({ fromName, toName }: { fromName: string; toName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function blockPair() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/combined/restrictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personAName: fromName, personBName: toName }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not save this rule");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-col items-end">
      {!confirming ? (
        <span className="group relative inline-flex">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
          >
            Can’t pay directly ⓘ
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-20 w-64 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {fromName} and {toName} will never be asked to pay one another directly. SettleUp
            recalculates the plan and uses another eligible person as a route when needed.
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={blockPair}
            className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Block this pair"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </span>
      )}
      {error ? <span className="mt-1 text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}

function RestrictionList({ restrictions }: { restrictions: Restriction[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/combined/restrictions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not remove this rule");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusyId(null);
    }
  }

  if (restrictions.length === 0) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">No-direct-payment rules</p>
          <p className="text-xs text-slate-500">
            These rules only apply to the combined-groups settlement plan.
          </p>
        </div>
        <Badge tone="amber">{restrictions.length} active</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {restrictions.map((restriction) => (
          <span
            key={restriction.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 py-1 pl-2.5 pr-1 text-xs font-medium text-amber-900"
          >
            {restriction.personAName} ↔ {restriction.personBName}
            <button
              type="button"
              disabled={busyId === restriction.id}
              onClick={() => remove(restriction.id)}
              className="rounded-full px-1.5 py-0.5 font-bold text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
              title="Allow direct payments between this pair again"
              aria-label={`Remove restriction for ${restriction.personAName} and ${restriction.personBName}`}
            >
              {busyId === restriction.id ? "…" : "×"}
            </button>
          </span>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
