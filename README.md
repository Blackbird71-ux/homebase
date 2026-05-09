# HomeBase — Family Management Platform

## Overview
HomeBase is a self-hosted family management platform for private NAS deployment. It provides a single hub for calendar, meal planning, shopping lists, recipes, notes, chores, and a full household finance module.

**Live:** https://homebase.liddleapps.com  
**Stack:** Next.js 16 · TypeScript · SQLite · Prisma · Docker  
**Deployment:** Synology NAS via Cloudflare Argo Tunnel

---

## Recent Changes — Finance Module (May 2026)

### Income accuracy & cash-basis accounting
- **Date-received dialog** on income "mark as received" — pick the actual bank-credit date (defaults to today, fully backdatable). Previously the date was silently stamped as now.
- **Date-paid dialog** on bills "mark as paid" — same pattern.
- **Auto-creates a `FinanceTransaction`** when income is received or a bill is paid, so account balances and the transaction feed stay accurate without manual entry. Undo reverses the transaction.
- **Fixed overdue logic**: freshly-spawned child income entries now get a grace period equal to one full pay cycle before being flagged overdue. Previously marking pay as received caused it to reappear as overdue immediately.
- **Cash-basis P&L**: the Profit & Loss report now slots received income by `receivedDate` and paid bills by `paidDate`, not by their expected/due dates.

### Category dropdowns — sorted and grouped
All category `<select>` elements across the finance module:
- Sorted alphabetically (parents A→Z, children A→Z under each parent)
- Children indented with `— ` prefix
- **Vendors**: default-category dropdown now shows Income / Expense / Transfer in labelled sections (previously expense-only, which made it impossible to assign an income category to an employer/payer)

### New migration
`20260514000000_add_income_transaction_link` — adds `transactionId` FK to both `FinanceIncomeEntry` and `FinanceRecurringBill`. Runs automatically on container start.

---

## Features

### Household Finance
- **Bills** — recurring and one-off, mark paid with date, invoice attachments, budget planner integration
- **Income** — recurring and one-off, mark received with date, payslip/remittance attachments, payer/source via Vendors
- **Transactions** — full transaction feed auto-populated when bills are paid / income is received
- **Accounts** — bank accounts, credit cards, savings, investment, entity accounts
- **Budget** — monthly budget rules linked to bills and categories
- **P&L** — cash-basis profit & loss by period (month/quarter/year) with category drill-down
- **Categories** — hierarchical income/expense/transfer categories; sorted across all dropdowns
- **Vendors** — shared payer/payee list used on both bills and income
- **Entities** — Super Fund, Trust, Business, etc. for multi-entity households
- **Goals** — savings goals linked to accounts

### Calendar & Events
- Month/week views; recurring events (daily/weekly/monthly/yearly); Google Calendar sync
- Colour-coded categories; all-day events; delete single instance or full series

### Meal Planning
- Weekly grid with multiple meals per day; recipe assignment; grocery list export
- Rolling 7/14/30 day scope selector

### Lists
- Shopping and todo lists; category grouping; drag-and-drop; per-user assignment
- My Tasks / Family Tasks filtering

### Recipes
- Full CRUD; import from URL; Umami archive import; recipe books; ingredient category parsing

### Notes
- Rich text editor; family sharing; PIN protection with 15-minute session unlock; content masking

### Document & Contact Vault
- PIN-protected documents and household contacts; masked until unlocked

### Chores
- Recurring chore scheduling; assignee rotation; notes field; email reminders

### AI Assistant
- Floating chat panel on every page; voice (Web Speech API) and text input
- Google Gemini or DeepSeek; bring your own API key; per-user provider setting
- 19 actions: meal plan, shopping, todo, calendar, chores, notes, recipes, contacts, documents, birthdays

### Theming
- Dark / light / auto; 5 Apple-system themes; font size and done-item colour customisation

---

## Quick Start

```bash
git clone <repo-url>
cd homebase
npm install
cp env.local.example .env.local   # fill in AUTH_SECRET, ENCRYPTION_KEY
npx prisma migrate deploy
npx prisma generate
npm run dev                        # http://localhost:3300
```

## Production Deploy (NAS)

```bat
# On Windows — build image, save tar, SCP to NAS
deploy-build.bat
```

```bash
# On NAS SSH — load image, restart container
sudo sh /volume1/docker/homebase/deploy-nas.sh
```

Migrations run automatically at container start. See [DEPLOY.md](DEPLOY.md) for full setup.

---

## Project Structure

```
homebase/
├── src/
│   ├── app/
│   │   ├── (app)/finance/      # Finance pages (income, bills, transactions, p&l, …)
│   │   ├── (app)/calendar/
│   │   ├── (app)/home/
│   │   ├── (app)/lists/
│   │   ├── (app)/meal-plan/
│   │   ├── (app)/notes/
│   │   ├── (app)/recipes/
│   │   ├── (app)/settings/
│   │   └── api/                # API routes
│   ├── components/
│   ├── lib/
│   │   ├── finance-categories.ts   # sortedCategoryList() utility
│   │   └── …
│   └── types/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docker/
│   └── entrypoint.sh           # Runs migrations + starts app
├── Dockerfile
├── docker-compose.yml
├── deploy-build.bat
├── deploy-nas.sh
├── DEPLOY.md
└── PROJECT_SUMMARY.md
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | ✅ | NextAuth v5 secret (32+ random bytes) |
| `AUTH_URL` | ✅ | Public URL e.g. `https://homebase.liddleapps.com` |
| `NEXTAUTH_SECRET` | ✅ | Same as `AUTH_SECRET` |
| `NEXTAUTH_URL` | ✅ | Same as `AUTH_URL` |
| `ENCRYPTION_KEY` | ✅ | Invite code encryption (32 random bytes, different from AUTH_SECRET) |
| `DATABASE_URL` | Auto | Set by deploy script: `file:/data/homebase.db` |
| `CRON_SECRET` | Recommended | Protects the reminders endpoint |
| `ADMIN_RESET_TOKEN` | Recommended | Emergency password reset API |
| `GOOGLE_CLIENT_ID/SECRET` | Optional | Enables Google Calendar sync |

---

## Documentation

- [DEPLOY.md](DEPLOY.md) — Full NAS / Cloudflare tunnel deployment guide
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — Architecture, migrations, feature detail

---

**Version:** 3.0.0  
**Last updated:** May 2026  
**Status:** ✅ Production
