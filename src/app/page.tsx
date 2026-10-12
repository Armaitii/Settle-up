import Link from "next/link";
import { DemoActions } from "@/components/forms";
import { CombinedSettlement } from "@/components/combined-settlement";
import { Avatar, Badge, Card, EmptyState, SectionTitle, StatTile } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { getCrossGroupSummary, listGroups } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [groupSummaries, crossGroup] = await Promise.all([
    listGroups(),
    getCrossGroupSummary(),
  ]);

  const youOwe = groupSummaries.reduce(
    (acc, item) => acc + Math.min(0, item.selfNetCents),
    0,
  );
  const owedToYou = groupSummaries.reduce(
    (acc, item) => acc + Math.max(0, item.selfNetCents),
    0,
  );
  const totalTransfers = groupSummaries.reduce(
    (acc, item) => acc + item.plan.transactionCount,
    0,
  );
  const savedTransfers = groupSummaries.reduce(
    (acc, item) => acc + item.plan.savedTransactions,
    0,
  );
  const currency = groupSummaries[0]?.group.currency ?? "USD";
  const crossGroupUseful = crossGroup.people.length > 0 && groupSummaries.length > 1;

  if (groupSummaries.length === 0) {
    return (
      <div className="space-y-8">
        <Hero />
        <EmptyState
          icon="🧾"
          title="No groups yet"
          description="Create a group for your trip, flat or family, add the people in it, and start logging who paid for what. SettleUp will work out the smallest set of payments that clears every debt."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/groups"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Create your first group
              </Link>
              <DemoActions hasData={false} />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your money at a glance</h1>
          <p className="mt-1 text-slate-500">
            {groupSummaries.length} group{groupSummaries.length === 1 ? "" : "s"} ·{" "}
            {totalTransfers} transfer{totalTransfers === 1 ? "" : "s"} needed to settle everything
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/groups"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Manage groups
          </Link>
          <DemoActions hasData />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="You are owed"
          value={formatCents(owedToYou, currency)}
          tone="positive"
          hint="Across all groups"
        />
        <StatTile
          label="You owe"
          value={formatCents(Math.abs(youOwe), currency)}
          tone="negative"
          hint="Across all groups"
        />
        <StatTile
          label="Transfers needed"
          value={String(totalTransfers)}
          hint={`${savedTransfers} fewer than paying pair by pair`}
        />
        <StatTile
          label="Groups"
          value={String(groupSummaries.length)}
          hint="Each settles independently"
        />
      </div>

      <section>
        <SectionTitle
          title="Your groups"
          subtitle="Every group is a closed circle — debts never leak outside it."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {groupSummaries.map(({ group, memberCount, balances, plan, selfNetCents, selfName }) => {
            const debtors = balances.filter((b) => b.netCents < 0);
            const creditors = balances.filter((b) => b.netCents > 0);
            return (
              <Card key={group.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/groups/${group.id}`}
                      className="text-lg font-semibold tracking-tight hover:text-indigo-700"
                    >
                      {group.name}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">
                      {group.description ?? `${memberCount} members`}
                    </p>
                  </div>
                  <Badge tone="indigo">{group.currency}</Badge>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  {selfNetCents === 0 ? (
                    <p className="text-sm font-medium text-slate-600">
                      {selfName ? `${selfName} are all square 🎉` : "All square 🎉"}
                    </p>
                  ) : selfNetCents > 0 ? (
                    <p className="text-sm text-slate-600">
                      You are owed{" "}
                      <span className="font-semibold text-emerald-600">
                        {formatCents(selfNetCents, group.currency)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      You owe{" "}
                      <span className="font-semibold text-rose-600">
                        {formatCents(Math.abs(selfNetCents), group.currency)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Owes the group
                    </p>
                    <div className="space-y-1">
                      {debtors.length === 0 ? (
                        <p className="text-xs text-slate-400">Nobody</p>
                      ) : (
                        debtors.slice(0, 3).map((member) => (
                          <div key={member.memberId} className="flex items-center gap-2">
                            <Avatar name={member.name} size="sm" />
                            <span className="flex-1 truncate text-slate-600">
                              {member.isSelf ? "You" : member.name}
                            </span>
                            <span className="tabular-nums text-rose-600">
                              {formatCents(Math.abs(member.netCents), group.currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Gets back
                    </p>
                    <div className="space-y-1">
                      {creditors.length === 0 ? (
                        <p className="text-xs text-slate-400">Nobody</p>
                      ) : (
                        creditors.slice(0, 3).map((member) => (
                          <div key={member.memberId} className="flex items-center gap-2">
                            <Avatar name={member.name} size="sm" />
                            <span className="flex-1 truncate text-slate-600">
                              {member.isSelf ? "You" : member.name}
                            </span>
                            <span className="tabular-nums text-emerald-600">
                              {formatCents(member.netCents, group.currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    {plan.transactionCount === 0
                      ? "Settled up"
                      : `${plan.transactionCount} transfer${
                          plan.transactionCount === 1 ? "" : "s"
                        } to clear this group`}
                  </span>
                  <Link
                    href={`/groups/${group.id}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Open →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {crossGroupUseful ? (
        <section>
          <SectionTitle
            title="Combine every group (optional)"
            subtitle="Same person in several groups? This nets them into one person and shows the shortest global path. Settling this way does cross group boundaries."
          />
          <div className="space-y-4">
            <Card className="p-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {crossGroup.people.map((person) => (
                  <div
                    key={person.memberId}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <Avatar name={person.name} size="sm" />
                    <span className="flex-1 truncate text-sm font-medium text-slate-700">
                      {person.isSelf ? "You" : person.name}
                    </span>
                    <span
                      className={
                        person.netCents === 0
                          ? "text-sm font-semibold tabular-nums text-slate-400"
                          : person.netCents > 0
                            ? "text-sm font-semibold tabular-nums text-emerald-600"
                            : "text-sm font-semibold tabular-nums text-rose-600"
                      }
                    >
                      {person.netCents === 0
                        ? "square"
                        : formatCents(Math.abs(person.netCents), currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
            <CombinedSettlement
              transfers={crossGroup.plan.transfers}
              restrictions={crossGroup.restrictions ?? []}
              currency={currency}
              usesIntermediary={crossGroup.plan.usesIntermediary}
              unresolvedMessage={crossGroup.plan.unresolvedMessage}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Hero() {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70 p-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Shared money, settled in the fewest payments.
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        SettleUp keeps each group of friends or family in its own closed circle. Log who paid, who
        owes whom, and any repayments — the engine nets everything down and tells you the smallest
        set of transfers that clears every debt.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          {
            step: "1",
            title: "Create a group",
            text: "Name it, add yourself and the people you share money with.",
          },
          {
            step: "2",
            title: "Log the money",
            text: "Split expenses, record “A owes B”, and log payments that already happened.",
          },
          {
            step: "3",
            title: "Settle up",
            text: "Follow the simplified plan — the minimum number of transfers.",
          },
        ].map((item) => (
          <div key={item.step} className="rounded-xl border border-slate-200 bg-white/80 p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {item.step}
            </span>
            <p className="mt-2.5 font-semibold text-slate-800">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
