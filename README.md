# Settle Up

Settle Up is a self-hosted expense-splitting web app. Create groups with
friends, family, or roommates, log shared expenses and direct debts, and
the app figures out the **fewest possible payments** needed to make
everyone whole.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS · Drizzle ORM · PostgreSQL

---

## Setup

### Prerequisites

| Tool       | Version    | Why                              |
| ---------- | ---------- | -------------------------------- |
| **Node.js** | 20.9+ (22 recommended) | Runs the app                    |
| **npm**     | 10+        | Installs packages (ships with Node) |
| **PostgreSQL** | 14+ (16 recommended) | Stores all data                 |

Check that everything is available:

```bash
node -v
npm -v
psql --version
```

### Install dependencies

```bash
npm install
```

### Start PostgreSQL

Use whichever method works for your system:

**Docker (any OS):**

```bash
docker run --name settleup-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 -d postgres:16

# Later restarts:
docker start settleup-db
```

**Ubuntu / WSL:**

```bash
sudo service postgresql start
```

**macOS (Homebrew):**

```bash
brew services start postgresql@16
```

Verify it's running:

```bash
pg_isready -h 127.0.0.1 -p 5432
# expect: accepting connections
```

### Create the database

```bash
createdb -U postgres -h 127.0.0.1 app_db
```

### Configure environment

```bash
cp .env.example .env
```

The default contents work with the standard local Postgres setup:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

> **Note:** `drizzle.config.json` contains the same connection URL. If you
> change database credentials, update **both** files.

### Create the tables

```bash
npm run db:push
```

Verify the five tables exist:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -c "\dt"
```

You should see: `groups`, `members`, `expenses`, `expense_shares`, `payments`.

---

## Usage

### Start the app

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. Leave the terminal open while
you use the site; stop it with `Ctrl + C`.

> **Tip:** On the dashboard, click **Load demo groups** to populate sample
> data immediately and explore the UI.

### Working with groups

1. **Create a group** — give it a name, pick a currency, enter your name,
   and add the other people involved.
2. **Add entries:**
   - **Split an expense** — one person paid; split equally or with custom
     amounts across chosen members.
   - **A owes B** — record a direct debt between two members.
   - **Record a payment** — money that already changed hands (e.g. a Venmo
     transfer).
3. **Review the group tabs:**
   - **Balances** — net position for each member (positive = owed money).
   - **Who owes whom** — raw pair-by-pair obligations before simplification.
   - **Settle up** — the minimal set of transfers that clears all debts.
     Mark individual transfers as paid or record the whole plan at once.
   - **Activity** — full ledger of every entry.
   - **People** — add or remove members.

### Combined settlement

The **History** page has a combined view that nets the same person across
all groups into a single balance and produces a unified settle-up plan. You
can also add **transfer restrictions** — pairs of people who should never
pay each other directly — and the engine will route money through an allowed
intermediary instead.

### Undo and delete

Every expense, debt, and payment can be **undone** (creates a reversal entry)
or **deleted** from the activity/history views.

### Access from other devices

To use the app on a phone or another PC on the same network:

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

Then open `http://<YOUR_LAN_IP>:3000` on the other device. You may need to
allow inbound port 3000 in your firewall.

> **Security:** Binding to `0.0.0.0` makes the app reachable by anyone on
> your local network. There is no login system — only do this on trusted
> networks.

### Production build

```bash
npm run build
npm run start
```

---

## How the settlement algorithm works

The goal is to settle all debts in a group using the **fewest possible
transfers**. Here is what the engine does, step by step.

### Step 1 — Compute net balances

For every member the engine adds up what they paid, what they owe, and
any payments already made. The result is a single number per person:

- **Positive** — the group owes them money (they are a creditor).
- **Negative** — they owe the group money (they are a debtor).
- **Zero** — they are already square.

In a balanced group the positives and negatives sum to zero.

### Step 2 — Find independent clusters

People can often be split into smaller groups that settle among themselves
without touching anyone else. For example, if Alice, Bob, and Carol's
balances cancel out on their own, they form one cluster; Dave and Eve form
another. Settling each cluster independently produces fewer total transfers
than treating everyone as one big pool.

The engine finds these clusters by testing every possible subset (bitmask
search) and keeping the largest ones whose balances sum to zero. For
groups larger than 16 people it falls back to treating everyone as a single
cluster — friend groups are almost always small enough for the exact search.

### Step 3 — Greedy min-cash-flow within each cluster

Inside each cluster the engine runs a simple greedy loop:

1. Pick the person with the **largest remaining debt** (most negative).
2. Pick the person with the **largest remaining credit** (most positive).
3. The debtor pays the creditor the **smaller** of the two amounts.
4. One of them is now settled (their remaining hits zero) and drops out.
5. Repeat until everyone is at zero.

Because each transfer retires at least one person, a cluster of *k*
people needs at most **k − 1** transfers — far fewer than the potentially
*k × k* raw pairwise obligations.

### Restricted settlement (combined view)

When the combined view is used, you can block certain pairs from paying
each other directly. The engine handles this by:

1. **Checking feasibility** — it builds a graph of allowed payment
   connections and verifies that every connected component's balances
   still sum to zero. If not, the restrictions are impossible to satisfy.
2. **Searching for a direct plan** — it tries to find the fewest transfers
   using only allowed pairs (exhaustive search for small groups, greedy
   for larger ones).
3. **Routing through intermediaries** — if no direct plan exists, it finds
   the shortest allowed path from each debtor to a creditor and flows
   money through the intermediary people along that path.

---

## Available scripts

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start the dev server with hot reload |
| `npm run build`     | Build for production                |
| `npm run start`     | Serve the production build          |
| `npm run typecheck` | Run the TypeScript compiler check   |
| `npm run db:push`   | Apply database schema changes       |