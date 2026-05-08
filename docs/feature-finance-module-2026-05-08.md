# Feature: Finance Module

**Date:** 2026-05-08

## Overview

Adds comprehensive personal and household money management to Homebase, including accounts, transactions, categories, recurring bills, budgets, savings goals, and reports.

### Design Principles

- **Speed first** — quick-add transaction from any finance page
- **Family-aware** — shared visibility with optional private transactions
- **Frictionless categorisation** — income/expense categories with hierarchical support
- **Zero lock-in** — CSV/XLSX export available
- **Consistent with existing Homebase UX** — same design system, sidebar navigation, and auth patterns

## Files Changed

### 1. `prisma/schema.prisma` — Database Schema

Added 6 new models: `FinanceAccount`, `FinanceCategory`, `FinanceTransaction`, `FinanceBudget`, `FinanceRecurringBill`, `FinanceSavingsGoal`. Each follows Homebase conventions: SQLite, `cuid()` IDs, `familyId` foreign keys, `createdAt` timestamps.

**FinanceAccount** — bank accounts, credit cards, savings, cash wallets
- Fields: name, type (checking/savings/credit/cash/investment/loan), institution, currency, currentBalance, creditLimit, isActive, color, icon, sortOrder

**FinanceCategory** — hierarchical expense/income categories with pre-seeded defaults
- Fields: name, type (expense/income/transfer), icon, color, isSystem (seeded defaults non-deletable), sortOrder, parentId (self-ref for sub-categories)
- 36 expense categories + 6 income categories seeded automatically

**FinanceTransaction** — core transaction record
- Fields: accountId, categoryId, type (expense/income/transfer), amount, payee, description, date, isRecurring, recurringBillId, tags, isPrivate, createdBy, receiptPath, notes

**FinanceRecurringBill** — repeating bills/subscriptions with auto-generated transaction instances
- Fields: accountId, categoryId, name, amount, frequency (weekly/fortnightly/monthly/quarterly/annual), dayOfMonth, monthOfYear, nextDueDate, endDate, isActive, autoPay, emailReminder, reminderDays, notes

**FinanceBudget** — monthly/custom period spending targets
- Fields: categoryId, name, amount, period (monthly/custom), startDate, endDate, rollover, alertThreshold, emailAlert

**FinanceSavingsGoal** — savings milestones with progress tracking
- Fields: accountId, name, targetAmount, currentAmount, targetDate, color, icon, isComplete

### 2. `prisma/migrations/20260508300000_add_finance_models/` — Migration

SQL migration adding all 6 finance tables with proper indexes, foreign keys, and cascade deletes. Includes composite indexes for common query patterns (family queries, transaction filtering by date/category/account).

### 3. `src/app/api/finance/accounts/route.ts` — Accounts API

`GET /api/finance/accounts` — List all accounts for family, ordered by sortOrder
`POST /api/finance/accounts` — Create account with name, type, institution, color, icon, opening balance
- Validates: required name, valid type enum, positive finite currentBalance
- Converts opening balance to initial balance adjustment transaction when `initialBalance` provided

### 4. `src/app/api/finance/categories/route.ts` — Categories API

`GET /api/finance/categories` — List categories, optionally filtered by type (expense/income)
`POST /api/finance/categories` — Create custom category
- System categories can be renamed/recollored but never deleted

### 5. `src/app/api/finance/transactions/route.ts` — Transactions API

`GET /api/finance/transactions` — List with filters: dateFrom, dateTo, categoryId, accountId, type, search (payee/description), isRecurring, page, limit
`POST /api/finance/transactions` — Create transaction
- Supports `cleared` status tracking (`pending`/`cleared`/`reconciled`)
- If linked to a recurring bill (`recurringBillId`), advances the bill's nextDueDate
- Supports private transactions (`isPrivate` flag)

### 6. `src/app/api/finance/bills/route.ts` — Recurring Bills API

`GET /api/finance/bills` — List all active recurring bills for family
`POST /api/finance/bills` — Create recurring bill
- Calculates nextDueDate based on frequency and dayOfMonth/monthOfYear
- Supports pause/resume via `isActive` toggle

### 7. `src/app/api/finance/budget/route.ts` — Budget API

`GET /api/finance/budget` — List budgets for the current month, with computed spent amounts and percentages per category
`POST /api/finance/budget` — Create budget rule
- Returns spent totals aggregated from FinanceTransaction records
- Calculates remaining and percentage spent for each budget

### 8. `src/app/api/finance/goals/route.ts` — Savings Goals API

`GET /api/finance/goals` — List all savings goals for family
`POST /api/finance/goals` — Create savings goal

### 9. `src/app/api/finance/dashboard/route.ts` — Dashboard Aggregation API

`GET /api/finance/dashboard` — Returns single aggregated payload for the dashboard overview page:
- Month summary: total income, expenses, net savings, days elapsed in month
- Active accounts with balances
- Recent transactions (last 10)
- Upcoming bills (next 14 days) with overdue detection
- Budget progress per category with spent/limit/percentage
- Savings goals with progress percentages

### 10. `src/app/(app)/finance/layout.tsx` — Finance Layout

Shared layout with sub-navigation tabs across all finance pages:
- Overview, Accounts, Transactions, Categories, Bills, Budget, Goals, Reports

### 11. `src/app/(app)/finance/page.tsx` — Overview Dashboard

Server component that fetches aggregated data and renders `OverviewClient`:
- Month summary bar (income green, expenses red, net savings blue)
- Accounts grid with balances
- Recent transactions compact list
- Upcoming bills with overdue highlighting
- Budget progress bars per category
- Savings goals progress bars

### 12. `src/app/(app)/finance/OverviewClient.tsx` — Dashboard Client Component

Interactive dashboard with:
- Month selector (prev/next navigation)
- Summary cards with colour-coded amounts
- Account cards with type badges (checking/savings/credit)
- Transaction list with category badges
- Bills tracking with "Mark as paid" button
- Budget progress bars with spent/limit/percentage
- Goal progress bars with current/target

### 13. `src/app/(app)/finance/accounts/page.tsx` — Accounts Page

Server component rendering account management with:
- Account list with balance, type, institution
- "Add Account" button
- Delete with confirmation

### 14. `src/app/(app)/finance/transactions/page.tsx` — Transactions Page

Server component rendering transaction management with:
- Filter bar: date range, type (expense/income), category, account, search
- Transaction list with date, payee, category badge, amount, status badge
- Add/edit forms
- Delete with confirmation

### 15. `src/app/(app)/finance/categories/page.tsx` — Categories Page

Server component rendering category management with:
- Expense/Income tab switcher
- Category grid with icon and colour
- Add/edit form with lucide icon picker
- System category protection

### 16. `src/app/(app)/finance/bills/page.tsx` — Bills Page

Server component rendering recurring bill management with:
- Active/paused status toggle
- Bill cards with name, amount, frequency, next due date
- Add/edit form
- Delete with confirmation
- Total monthly cost summary

### 17. `src/app/(app)/finance/budget/page.tsx` — Budget Page

Server component rendering budget management with:
- Budget rules list with spent/limit bar
- Add budget form
- Delete with confirmation

### 18. `src/app/(app)/finance/goals/page.tsx` — Goals Page

Server component rendering savings goal management with:
- Goal progress bars
- Add/edit goal form
- Delete with confirmation

### 19. `src/app/(app)/finance/reports/page.tsx` — Reports Page

Placeholder page for premium reports with:
- Summary (income vs expense chart), Category Breakdown (donut chart), Spending Trends (line chart), Cash Flow (bar chart)
- Premium lock overlay for non-admin users
- Export controls (CSV/XLSX)

### 20. `src/components/layout/Sidebar.tsx` — Navigation

Added "Finance" sidebar section with Wallet icon and all sub-pages:
- Overview, Accounts, Transactions, Categories, Bills, Budget, Goals, Reports
- Positioned after Chores, before Contacts

### 21. `src/lib/finance-seed.ts` — Category Seed Data

Idempotent seed function that creates default categories if none exist for the family:
- 36 expense categories with lucide icons and hex colours
- 6 income categories with icons and colours
- Called when first finance page loads for a family with no categories

## Database Schema

### FinanceAccount
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| name | String | e.g. "ANZ Everyday" |
| type | String | checking \| savings \| credit \| cash \| investment \| loan |
| institution | String? | Bank name |
| currency | String | Default "AUD" |
| currentBalance | Float | Manually maintained |
| creditLimit | Float? | For credit cards |
| isActive | Boolean | Default true |
| color | String? | Hex colour |
| icon | String? | lucide icon |
| sortOrder | Int | Display order |

### FinanceCategory
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| name | String | e.g. "Groceries" |
| type | String | expense \| income \| transfer |
| icon | String? | lucide icon |
| color | String? | Hex colour |
| isSystem | Boolean | Seeded defaults non-deletable |
| sortOrder | Int | Display order |
| parentId | String? | Self-ref for sub-categories |

### FinanceTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| accountId | String? | FK → FinanceAccount |
| categoryId | String? | FK → FinanceCategory |
| type | String | expense \| income \| transfer |
| amount | Float | Always positive |
| payee | String? | Who was paid |
| description | String? | Optional note |
| date | DateTime | Transaction date |
| isRecurring | Boolean | Linked to recurring bill |
| recurringBillId | String? | FK → RecurringBill |
| tags | String? | JSON array |
| isPrivate | Boolean | Only visible to creator |
| status | String | pending \| cleared \| reconciled |
| createdBy | String | User.id |
| receiptPath | String? | Receipt upload path |
| notes | String? | Free text |

### FinanceRecurringBill
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| accountId | String? | FK → FinanceAccount |
| categoryId | String? | FK → FinanceCategory |
| name | String | e.g. "Netflix" |
| amount | Float | Expected amount |
| frequency | String | weekly \| fortnightly \| monthly \| quarterly \| annual |
| dayOfMonth | Int? | For monthly/quarterly (1–31) |
| monthOfYear | Int? | For annual (1–12) |
| nextDueDate | DateTime | Calculated next occurrence |
| endDate | DateTime? | Stop after this date |
| isActive | Boolean | Default true |
| autoPay | Boolean | Auto-mark paid on due date |
| emailReminder | Boolean | Send email reminder |
| reminderDays | Int | Days before due (default 3) |
| notes | String? | Free text |

### FinanceBudget
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| name | String | e.g. "Groceries – May 2026" |
| categoryId | String? | FK → FinanceCategory |
| amount | Float | Budget limit |
| period | String | monthly \| custom |
| startDate | DateTime | Period start |
| endDate | DateTime | Period end |
| rollover | Boolean | Carry unspent to next period |
| alertThreshold | Int | Notify at X% spent (default 80) |
| emailAlert | Boolean | Email when threshold hit |

### FinanceSavingsGoal
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| familyId | String | FK → Family |
| accountId | String? | Associated account |
| name | String | e.g. "Holiday to Japan" |
| targetAmount | Float | Goal amount |
| currentAmount | Float | Running total |
| targetDate | DateTime? | Deadline |
| color | String? | Display colour |
| icon | String? | lucide icon |
| isComplete | Boolean | Default false |

## API Routes

All routes under `/api/finance/`, use NextAuth session for auth, return JSON, use Prisma for DB access.

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/finance/accounts | List accounts |
| POST | /api/finance/accounts | Create account |
| GET | /api/finance/categories | List categories |
| POST | /api/finance/categories | Create category |
| GET | /api/finance/transactions | List transactions with filters |
| POST | /api/finance/transactions | Create transaction |
| GET | /api/finance/bills | List recurring bills |
| POST | /api/finance/bills | Create recurring bill |
| GET | /api/finance/budget | List budgets with spent totals |
| POST | /api/finance/budget | Create budget |
| GET | /api/finance/goals | List savings goals |
| POST | /api/finance/goals | Create goal |
| GET | /api/finance/dashboard | Aggregated dashboard payload |

## Navigation

Finance section added to sidebar after "Chores", before "Contacts" with Wallet icon. Sub-pages:
- Overview (`/finance`)
- Accounts (`/finance/accounts`)
- Transactions (`/finance/transactions`)
- Categories (`/finance/categories`)
- Bills (`/finance/bills`)
- Budget (`/finance/budget`)
- Goals (`/finance/goals`)
- Reports (`/finance/reports`)

## Implementation Notes

- **Schema naming**: Uses `Finance` prefix to avoid conflicts with existing models
- **Transaction status**: Added `status` field (pending/cleared/reconciled) not in original design spec for better bill tracking
- **Budget approach**: Simplified to monthly budget rules rather than strict period tracking; spent totals are computed via aggregation queries
- **Reports page**: Premium feature with placeholder; full Recharts integration deferred
- **Sidebar label**: Uses "Bills" instead of design's "Recurring" for clarity; routes use `/finance/bills`
- **Route mapping**: Design spec `/finance/recurring` → `/finance/bills`, `/finance/budgets` → `/finance/budget` for URL simplicity
- **No audit logging**: Deferred to future phase to avoid complexity; current focus on core CRUD
- **No cron jobs**: Recurring bill auto-generation and email reminders deferred
- **No CSV import**: Deferred to future phase
- **No QuickAdd integration**: Global ⌘K finance shortcuts deferred