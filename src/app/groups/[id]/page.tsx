import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddEntryModal,
  AddPaymentModal,
  DeleteButton,
  EditGroupModal,
} from "@/components/forms";
import { GroupTabs, type GroupTabData } from "@/components/group-tabs";
import { Badge, Card, StatTile } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { getGroupDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  const detail = await getGroupDetail(groupId);
  if (!detail) notFound();

  const currency = detail.group.currency;
  const outstanding = detail.plan.transfers.reduce(
    (acc, transfer) => acc + transfer.amountCents,
    0,
  );

  const tabData: GroupTabData = {
    groupId: detail.group.id,
    currency,
    groupName: detail.group.name,
    members: detail.members.map((member) => ({
      id: member.id,
      name: member.name,
      isSelf: member.isSelf,
      email: member.email,
    })),
    balances: detail.balances,
    pairDebts: detail.pairDebts,
    plan: detail.plan,
    expenses: detail.expenses,
    payments: detail.payments,
  };

  const memberOptions = tabData.members;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/groups"
          className="text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-indigo-600"
        >
          ← All groups
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
              {detail.group.name}
              <Badge tone="indigo">{currency}</Badge>
            </h1>
            {detail.group.description ? (
              <p className="mt-1.5 max-w-2xl text-slate-500">{detail.group.description}</p>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">
              {detail.members.length} member{detail.members.length === 1 ? "" : "s"} ·{" "}
              {detail.totals.expenseCount} shared expense
              {detail.totals.expenseCount === 1 ? "" : "s"} · {detail.totals.debtCount} direct debt
              {detail.totals.debtCount === 1 ? "" : "s"} · {detail.totals.paymentCount} payment
              {detail.totals.paymentCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AddEntryModal groupId={detail.group.id} members={memberOptions} />
            <AddPaymentModal
              groupId={detail.group.id}
              members={memberOptions}
              label="Record a payment"
              variant="ghost"
            />
            <EditGroupModal group={detail.group} />
            <DeleteButton
              url={`/api/groups/${detail.group.id}`}
              confirmMessage="Delete this group?"
              redirectAfter="/groups"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Money tracked"
          value={formatCents(detail.totals.trackedCents, currency)}
          hint="Sum of all entries in this group"
        />
        <StatTile
          label="Already repaid"
          value={formatCents(detail.totals.settledCents, currency)}
          hint="Payments logged by the group"
          tone="positive"
        />
        <StatTile
          label="Still outstanding"
          value={formatCents(outstanding, currency)}
          hint="Total of the simplified plan"
          tone="negative"
        />
        <StatTile
          label="Transfers needed"
          value={String(detail.plan.transactionCount)}
          hint={
            detail.plan.savedTransactions > 0
              ? `${detail.plan.savedTransactions} fewer than pair-by-pair`
              : "Minimum possible set"
          }
        />
      </div>

      {detail.members.length < 2 ? (
        <Card className="border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
          Add at least one more person in the <strong>People</strong> tab below before logging money —
          debts always need two sides.
        </Card>
      ) : null}

      <GroupTabs data={tabData} />
    </div>
  );
}
