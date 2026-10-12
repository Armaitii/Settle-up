# SettleUp

Track shared expenses and debts inside friend/family groups, then settle everything
with the **fewest possible payments**.

- Log a **split expense**, a direct **A owes B**, or an **A pays B** repayment
- Each group is a closed circle — calculations never cross groups
- The settle engine nets balances and returns the minimum set of transfers

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS · Drizzle ORM · PostgreSQL

---

## What you need

| Tool | Version | Why |
| --- | --- | --- |
| **Node.js** | 20.9+ (22 recommended) | Runs the website |
| **npm** | 10+ | Installs packages (comes with Node) |
| **PostgreSQL** | 14+ (16 recommended) | Stores groups, people, expenses, payments |

This is a **Node.js** app. There is no Python code. Conda is optional and only
useful if you want it to provide Node and Postgres for you.

### Check your tools

```bash
node -v
npm -v
psql --version
```

If those print versions, you’re good.

---

## 1. One-time setup

Do this once after downloading the project.

### 1.1 Open the project folder

```bash
cd /path/to/settleup
ls package.json
```

You must be in the folder that contains `package.json`.

**WSL tip:** keep the project under your Linux home (`~/projects/...`), not under
`/mnt/c/...`. npm is much faster that way.

```bash
# Example if the zip is on Windows Downloads
mkdir -p ~/projects
cp -r /mnt/c/Users/<YourWindowsUser>/Downloads/settleup ~/projects/settleup
cd ~/projects/settleup
```

### 1.2 (Optional) Activate a conda env

Only if you installed Node/Postgres through conda:

```bash
conda activate settleup
```

### 1.3 Install website packages

```bash
npm install
```

### 1.4 Start PostgreSQL

**Option A — conda Postgres (macOS / Linux / WSL):**

```bash
export PGDATA="$CONDA_PREFIX/var/postgres"
mkdir -p "$PGDATA"

# First time only
initdb -D "$PGDATA" -U postgres --auth=trust

# Every reboot / new session if Postgres is stopped
pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -o "-p 5432" start
```

**Option B — Ubuntu/WSL system Postgres:**

```bash
sudo service postgresql start
# or: sudo systemctl start postgresql
```

**Option C — Docker (any OS):**

```bash
docker run --name settleup-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 -d postgres:16

# Later restarts:
docker start settleup-db
```

Check that Postgres is up:

```bash
pg_isready -h 127.0.0.1 -p 5432
# expect: accepting connections
```

### 1.5 Create the database (first time only)

```bash
createdb -U postgres -h 127.0.0.1 app_db
```

If it says the database already exists, that’s fine.

Test the connection:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -c "select 1;"
```

### 1.6 Create the `.env` file

```bash
cp .env.example .env
```

Default contents:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

> **Important:** `drizzle.config.json` has the **same URL hardcoded**.
> If you change the database name, user, password, or port, update **both**
> `.env` and `drizzle.config.json`.

### 1.7 Create the tables

```bash
npm run db:push
```

Confirm the 5 tables exist:

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -c "\dt"
```

You should see:

- `groups`
- `members`
- `expenses`
- `expense_shares`
- `payments`

---

## 2. Start and run the website

### Everyday start (development — recommended)

```bash
# 1) activate env if you use conda
conda activate settleup

# 2) go to the project
cd /path/to/settleup

# 3) make sure Postgres is running
pg_isready -h 127.0.0.1 -p 5432

# 4) start the website
npm run dev
```

You should see something like:

```text
▲ Next.js ...
- Local:   http://localhost:3000
```

Leave that terminal open while you use the site. Stop it with `Ctrl + C`.

### Production mode (optional)

```bash
npm run build
npm run start
```

Same browser URL: **http://localhost:3000**

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run typecheck` | TypeScript check only |
| `npm run db:push` | Apply database schema changes |

---

## 3. Open the website (the “HTML”)

This is a Next.js app, not a single static `.html` file. The server **renders the
pages for you**. You open it in a browser.

### Fastest way (same computer)

After `npm run dev` is running, open:

**http://localhost:3000**

That’s it.

Other useful local URLs:

| URL | What you get |
| --- | --- |
| http://localhost:3000 | Dashboard |
| http://localhost:3000/groups | Create / list groups |
| http://localhost:3000/groups/1 | A specific group (id may differ) |
| http://localhost:3000/api/health | Should return `{"ok":true}` |

### If port 3000 is already used

```bash
npm run dev -- -p 3001
```

Then open **http://localhost:3001**

### WSL + Windows browser

If the app runs inside WSL, Windows browsers can still open:

**http://localhost:3000**

WSL usually forwards localhost automatically.

### First visit tip

On the dashboard, click **Load demo groups** to get sample data immediately.
Or from a terminal:

```bash
curl -X POST http://localhost:3000/api/demo
```

Reset everything:

```bash
curl -X DELETE http://localhost:3000/api/demo
```

---

## 4. Open it from other devices (phone / tablet / another PC)

To use the site on another device on the **same Wi‑Fi**, the Next.js server must
listen on all network interfaces, not only `localhost`.

### 4.1 Start the server bound to your LAN

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

Or in production mode:

```bash
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

### 4.2 Find this computer’s LAN IP

**Linux / WSL / macOS:**

```bash
hostname -I
# or
ip addr show | grep "inet "
```

**Windows (PowerShell / CMD):**

```bat
ipconfig
```

Look for something like `192.168.1.42` or `10.0.0.15` (not `127.0.0.1`).

**WSL note:** WSL2 often has its own virtual IP. For phones/other PCs on Wi‑Fi,
use the **Windows host LAN IP** from `ipconfig`, not the WSL-only address. You
may also need a Windows port proxy (see troubleshooting below).

### 4.3 Open on the other device

In the phone/tablet/other PC browser:

```text
http://YOUR_LAN_IP:3000
```

Example:

```text
http://192.168.1.42:3000
```

### 4.4 Firewall

If the page doesn’t load:

- Allow inbound TCP **port 3000** on the host computer firewall
- Make sure both devices are on the **same Wi‑Fi** (not guest/isolated network)
- Corporate / school networks sometimes block device-to-device traffic

**Windows Firewall quick allow (admin PowerShell):**

```powershell
New-NetFirewallRule -DisplayName "SettleUp 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

**WSL2 port forward (if phone can’t reach WSL directly):**

In **admin PowerShell on Windows**:

```powershell
# Replace 192.168.1.42 with your Windows LAN IP if you want it explicit
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1
```

Then start the app in WSL with `-H 0.0.0.0` and open
`http://WINDOWS_LAN_IP:3000` on the phone.

### Security note

Binding to `0.0.0.0` makes the app reachable by anyone on your local network.
This project has **no login system**. Only do this on trusted home/office Wi‑Fi,
and stop the server when you’re done.

---

## 5. How to use the app

1. **Create a group** (`Groups` → New group)  
   Name, currency, your name, then friends/family.
2. **Add money**
   - **Split an expense** — someone paid, split equally or with custom amounts
   - **A owes B** — a direct debt between two people
   - **Record a payment** — money that already changed hands
3. **Read the group tabs**
   - **Balances** — who is up / down overall
   - **Who owes whom** — raw pair-by-pair obligations
   - **Settle up** — fewest transfers to clear the group
   - **Activity** — full ledger
   - **People** — add/remove members
4. On **Settle up**, mark one transfer paid, or record the whole plan at once.

---

## 6. Troubleshooting

| Problem | Fix |
| --- | --- |
| `DATABASE_URL is required` | Create `.env` from `.env.example` in the project root |
| `ECONNREFUSED 127.0.0.1:5432` | Start Postgres (`pg_ctl ... start`, `sudo service postgresql start`, or `docker start settleup-db`) |
| `database "app_db" does not exist` | `createdb -U postgres -h 127.0.0.1 app_db` |
| `relation "groups" does not exist` | `npm run db:push` |
| `password authentication failed` | Your Postgres user/password differs — update **both** `.env` and `drizzle.config.json` |
| Page won’t open on this PC | Confirm `npm run dev` is still running; try http://127.0.0.1:3000 |
| Port 3000 busy | `npm run dev -- -p 3001` |
| Phone can’t open the site | Start with `-H 0.0.0.0`, use the host LAN IP, allow firewall port 3000 |
| WSL works locally but not from phone | Use Windows LAN IP + portproxy / firewall rule (section 4) |
| Demo button blocked | Workspace not empty — reset with `curl -X DELETE http://localhost:3000/api/demo` |
| `/api/health` returns not ok | Postgres is down or `DATABASE_URL` is wrong |

---

## 7. Project map (short)

```text
src/
  app/                 # Pages + API routes
  components/          # UI and forms
  db/                  # Drizzle client + schema
  lib/                 # Settlement math, queries, writes
.env.example           # Copy to .env
drizzle.config.json    # DB URL used by `npm run db:push`
package.json           # Scripts and dependencies
```

---

## 8. Quick reference card

```bash
# setup once
cp .env.example .env
npm install
# start postgres, create app_db
npm run db:push

# run every day
npm run dev
# open http://localhost:3000

# open from phone / other devices on same Wi-Fi
npm run dev -- -H 0.0.0.0 -p 3000
# open http://YOUR_LAN_IP:3000
```
