import { HistoryView } from "@/components/history-view";
import { EmptyState } from "@/components/ui";
import { listHistory } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { items, membersByGroup } = await listHistory();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-1 max-w-2xl text-slate-500">
          Every group, person, expense, debt and payment — with dates. Click a calendar day to
          filter. Undo a done transaction to post the opposite entry (A paid B becomes B paid A).
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No activity yet"
          description="Create a group and log some money. Everything you do will show up here with its date."
          action={
            <Link
              href="/groups"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Go to groups
            </Link>
          }
        />
      ) : (
        <HistoryView items={items} membersByGroup={membersByGroup} />
      )}
    </div>
  );
}
