import Link from "next/link";
import { CreateGroupForm, DemoActions, DeleteButton, EditGroupModal } from "@/components/forms";
import { Avatar, Badge, Card, SectionTitle } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { listGroups } from "@/lib/queries";

export const dynamic = "force-dynamic";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY", "SGD", "AED"];

export default async function GroupsPage() {
  const groupSummaries = await listGroups();

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
          <p className="mt-1 text-slate-500">
            Calculations only ever happen inside a group — people in one group never affect another.
          </p>
        </div>
        <DemoActions hasData={groupSummaries.length > 0} />
      </div>

      <Card className="p-5">
        <SectionTitle
          title="New group"
          subtitle="Give it a name, add yourself, then add the people you share money with."
        />
        <CreateGroupForm currencies={CURRENCIES} />
      </Card>

      <section>
        <SectionTitle title={`Your groups (${groupSummaries.length})`} />
        {groupSummaries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500">
            Nothing here yet. Create a group above — or load the demo data to see how settling works.
          </div>
        ) : (
          <div className="space-y-3">
            {groupSummaries.map(({ group, memberCount, expenseCount, paymentCount, balances }) => (
              <Card key={group.id} className="p-4 transition hover:shadow-md">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/groups/${group.id}`}
                        className="truncate font-semibold tracking-tight hover:text-indigo-700"
                      >
                        {group.name}
                      </Link>
                      <Badge tone="indigo">{group.currency}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {group.description ?? "No description"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {memberCount} member{memberCount === 1 ? "" : "s"} · {expenseCount} entrie
                      {expenseCount === 1 ? "" : "s"} · {paymentCount} payment
                      {paymentCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex -space-x-2">
                    {balances.slice(0, 6).map((member) => (
                      <span key={member.memberId} className="rounded-full ring-2 ring-white">
                        <Avatar name={member.name} size="sm" />
                      </span>
                    ))}
                    {balances.length > 6 ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
                        +{balances.length - 6}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-right">
                    {(() => {
                      const self = balances.find((b) => b.isSelf);
                      if (!self) return <span className="text-xs text-slate-400">No “you”</span>;
                      if (self.netCents === 0)
                        return <span className="text-xs font-semibold text-slate-500">Square</span>;
                      return (
                        <span
                          className={
                            self.netCents > 0
                              ? "text-sm font-semibold tabular-nums text-emerald-600"
                              : "text-sm font-semibold tabular-nums text-rose-600"
                          }
                        >
                          {self.netCents > 0 ? "owed " : "owe "}
                          {formatCents(Math.abs(self.netCents), group.currency)}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/groups/${group.id}`}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Open
                    </Link>
                    <EditGroupModal group={group} compact />
                    <DeleteButton
                      url={`/api/groups/${group.id}`}
                      confirmMessage="Delete this group?"
                      redirectAfter="/groups"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
