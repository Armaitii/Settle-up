import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SettleUp — group debts, simplified",
  description:
    "Track shared expenses, direct debts and payments inside groups, then settle everything with the fewest possible transfers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-indigo-100/70 via-slate-50/0 to-transparent" />
        <header className="relative border-b border-slate-200/80 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm shadow-indigo-600/30">
                ⇄
              </span>
              <span className="text-lg font-bold tracking-tight">
                Settle<span className="text-indigo-600">Up</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Dashboard
              </Link>
              <Link
                href="/history"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                History
              </Link>
              <Link
                href="/groups"
                className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Groups
              </Link>
            </nav>
          </div>
        </header>
        <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
        <footer className="relative mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-400 sm:px-6">
          Debts never cross group boundaries — every calculation is netted inside the group it
          belongs to.
        </footer>
      </body>
    </html>
  );
}
