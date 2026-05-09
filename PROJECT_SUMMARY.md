# HomeBase — Project Summary
## Current Build: Half-Yearly Income Frequency

### Project Overview
HomeBase is a comprehensive family management platform built with Next.js 16, TypeScript, Prisma, and SQLite. The application provides a centralised hub for family organisation including calendar management, meal planning, shopping lists, recipes, notes, chores, and a full household finance module.

---

### Core Features Implemented

#### 1. Authentication & User Management
- Multi-user authentication with NextAuth
- Family-based user organisation with invite codes
- Role-based permissions (admin/member)
- User preferences, theme customisation, per-user AI provider settings

#### 2. Calendar & Event Management
- Family calendar with month/week views; personal vs family events
- Google Calendar synchronisation
- Colour-coded event categories (editable names and colours)
- All-day events; **recurring events** (daily/weekly/monthly/yearly)
- Delete single instance or entire recurring series

#### 3. Meal Planning System
- Weekly meal planning grid with drag-and-drop; multiple meals per day
- Recipe integration, grocery list generation, export
- Scope selector (7/14/30 days) rolling forward display

#### 4. Shopping & Todo Lists
- Multiple list types (shopping, todo), category-based organisation
- Drag-and-drop reordering, completed items with configurable colours
- Due dates, priority management; **per-user assignment** with My Tasks / Family Tasks filtering

#### 5. Recipe Management
- Recipe database with full CRUD, import from URL (web scraping), Umami archive import
- Recipe books, photo display, ingredient parsing and categorisation

#### 6. Tag & Ingredient Category Management
- Full CRUD for tags and ingredient categories; colour picker with live preview
- Machine learning-based category suggestions for ingredients

#### 7. Notes System
- Rich text editor; family-shared notes with categorisation and search
- **PIN Protection**: bcrypt-hashed PIN with 15-minute session cookies
- **Content Masking**: locked content blurred until PIN verified

#### 8. Advanced Theming System
- Dynamic dark/light/auto switching; font size and UI preference settings
- 5 Apple-system themes: `apple-aqua`, `apple-graphite`, `apple-sunset`, `apple-midnight`, `apple-forest`
- iOS utility tokens: `--cat-*` category colours and `--meal-*` meal-type colours

#### 9. Secure Document & Contact Vault
- PIN protection for documents and household contacts
- 15-minute httpOnly cookie-based unlock sessions; content masking until verified

#### 10. Audit Log & Activity Tracking
- Lightweight audit trail with undo support; JSON export; safe truncation

#### 11. AI Voice & Chat Assistant
- Floating Bot button on every page; Web Speech API for microphone transcription
- Multi-provider: Google Gemini or DeepSeek; per-user API key storage
- 19 actions across meal plan, shopping, todo, calendar, chores, notes, recipes, contacts, documents, birthdays
- Context-aware: AI receives family data in system prompt; PWA-compatible

#### 12. Finance Module ← *most recently enhanced*

Full household finance tracking — bills, income, transactions, accounts, budget, P&L, reports, vendors, categories, entities, locations, members.
Income tax tracking with ATO compliance support.

---

### Finance Module — Full Feature Reference

#### Accounts
- Checking, savings, credit, cash, investment, loan, entity accounts
- `currentBalance` updates automatically on every transaction create/edit/delete
- **Pending vs cleared split**: account cards now show pending transaction count, uncleared expense total, and uncleared income total in amber — so you can see what the bank shows vs what the app holds
- Accounts API returns `pendingCount`, `pendingExpense`, `pendingIncome` derived from `isCleared=false` transactions

#### Bills & Recurring Expenses
- Recurring and one-off bill tracking with due-date management
- Mark paid — **date-paid confirmation dialog** (defaults to today, fully backdatable)
- **Auto-creates a `FinanceTransaction` (expense)** on payment so account balances and transaction feed stay accurate
- Undo paid: reverses the auto-created transaction and removes the spawned next occurrence
- Invoice/document attachment support (PDF, JPG, PNG, DOC — max 2 per bill)
- Budget planner integration via "Include in budget" checkbox on form
- Fields: entity/fund, category, vendor, account, member, location, notes, email reminder
- **Clickable reference data**: vendor, member, and location names in each bill row are now clickable — clicking one activates a quick-filter badge that narrows the list to that value; click again or press × to clear

#### Income Tracking
- Recurring and one-off income entries
- Frequency options: weekly, fortnightly, monthly, quarterly, **6 Monthly / Half-Yearly**, yearly
- Mark as received — **date-received confirmation dialog** (defaults to today, fully backdatable)
  - **Auto-creates a `FinanceTransaction` (income)** on receipt so account balances stay accurate
  - Undo receipt: reverses the auto-created transaction and removes the spawned next occurrence
- Fixed overdue logic: freshly-spawned child entries get a grace period equal to one full pay cycle before being flagged overdue
- Remittance/payslip attachment support (max 2 per entry)
- Payer/source via the Vendors list — same vendor can appear on both bills (payee) and income (payer)
- Fields: entity/fund, category, vendor, account, member, location, notes, email reminder
- **Income Tax Tracking** — each income entry can be flagged for ATO/tax tracking with an optional estimated tax rate:
  - Toggle per income entry in the add/edit dialog
  - Orange "TAX TRACKED" pill displayed on income rows with rate shown when set
  - Tax rate percentage input (e.g. 30% for corporate, marginal rate for individuals)
  - Orange-themed tax tracking section in the form dialog with ReceiptText icon

#### Transactions
- Full CRUD; filters by type, member, location, **entity** (new)
- **Entity field added**: transactions can now be tagged to a FinanceEntity just like bills and income — complete field parity across all three
- Entity chip displayed on transaction row (non-default entities only)
- Auto-created transactions from bill payment / income receipt remain linked via `sourceBill` / `sourceIncomeEntry` reverse relations

#### Budget Planner
- Entity tabs isolate income and expenses per fund/entity
- **Single source of truth for income**: income streams are now derived live from `FinanceIncomeEntry` records — the old `budgetIncomeStreams` JSON blob on the Family table is retired
  - Budget page shows active, not-yet-received income entries per entity
  - "Manage income →" link takes user to the Income page to add/edit/delete
  - An info callout explains the link between Budget and Income data
  - Zero double-entry: the figure on the Budget page and the P&L page now come from the same records
- Expected costs section: bills flagged "include in budget" appear here automatically as budget rules
- Monthly / Yearly toggle on summary cards
- List and By Category views for expense rules

#### Profit & Loss
- **Cash / Forecast toggle** (new):
  - **Cash mode** (default): only paid bills slotted by `paidDate` + received income slotted by `receivedDate` — matches what actually hit the bank in the period; figures are meaningful as a true cash statement
  - **Forecast mode**: adds pending bills (by `nextDueDate`) and pending income (by `nextExpectedDate`) — useful for planning but clearly labelled as a mixed view
- Period controls: month / quarter / year with prev/next navigation
- Category breakdown with bar-chart percentages; drill-down to individual items
- Drill-down items show actual paid/received dates (cash mode) or scheduled dates (forecast mode)
- **Estimated Tax (ATO)** — auto-calculates tax liability from tax-tracked income:
  - Estimates use `periodAmount × taxRate / 100` for each tax-tracked income entry
  - Orange "Estimated Tax" summary card shows the ATO estimate for the period
  - "Estimated Tax (ATO)" line displayed in the expenses breakdown
  - Net Profit / Loss calculation now subtracts estimated tax
  - Works in both Cash and Forecast modes

#### Reports
- **Cash / Forecast toggle** (new): matches P&L semantics — Cash shows only paid bills by `paidDate`; Forecast shows all active bills by `nextDueDate`
- Summary card label changes: "Paid bills" in cash mode, "Expected bills" in forecast mode
- View by Category or by Vendor
- Period controls: month / quarter / year with prev/next navigation
- Drill-down to individual bills within a group

#### Savings Goals
- **Auto-progress from account balance** (new): when a goal is linked to an account, `currentAmount` is automatically derived from `account.currentBalance` — no more manual typing
  - Current Amount field is disabled and greyed out when an account is linked
  - A "📊 Balance from AccountName" indicator appears on the goal card
  - Works on both the Goals page and the Finance Overview page
- Manual tracking still available for goals without a linked account

#### Vendors
- Shared across bills (payee) and income (payer)
- **Description updated**: "Companies and contacts you pay bills to or receive income from" (was misleading: "companies you pay bills to")
- Usage counts: bills + transactions shown per vendor (same as before)

#### Categories
- Hierarchical (parent / child, 2 levels); income / expense / transfer types
- Tax deduction flag for expense and transfer categories
- **Usage counts** (new): each category row now shows transaction, bill, and income entry counts inline
- "Not In Use" root auto-collapsed on page load

#### Members
- Family members linked from User accounts
- **Usage counts** (new): each member row now shows bill, income, and transaction counts inline

#### Locations
- Property/address tags for bills, income, transactions
- **Usage counts** (new): each location card now shows bill, income, and transaction counts inline

#### Entities
- Funds/entities (Personal, Super Fund, Trust, Business, etc.)
- Bills, income, budget rules all filter by entity
- **Transactions now support entity** (new) — full parity with bills and income

---

### Technical Architecture

#### Database Schema (Prisma) — Finance Models
- **FinanceAccount**: Bank accounts, credit cards, savings, investment accounts; `currentBalance` maintained by transaction events
- **FinanceCategory**: Hierarchical income/expense/transfer categories (parent/child, 2 levels); usage counts via `_count`
- **FinanceTransaction**: Individual transactions; auto-created on bill payment / income receipt; `sourceIncomeEntry` and `sourceBill` reverse relations; **`entityId` FK** (new) for multi-entity support
- **FinanceRecurringBill**: Bills with `transactionId` FK → auto-created expense transaction; `parentBillId` for occurrence chaining
- **FinanceIncomeEntry**: Income with `parentIncomeId` self-reference for occurrence chaining and `transactionId` FK → auto-created income transaction; `isTaxTracked` (boolean) and `taxRate` (nullable float) for ATO tax tracking; frequency supports `weekly | fortnightly | monthly | quarterly | halfyearly | yearly | one-off`
- **FinanceBudget**: Budget rules linked to bills and categories
- **FinanceSavingsGoal**: Savings goals linked to accounts; `currentAmount` auto-derived from account balance in API layer
- **FinanceVendor**: Vendors/payers shared across bills and income; `_count` for usage stats
- **FinanceEntity**: Funds/entities; now has `transactions` back-relation (new)
- **FinanceLocation**: Property/location tags for bills, income, and transactions; `_count` for usage stats
- **BillAttachment / IncomeAttachment**: File attachments

#### Key Design Decisions
- **One income source of truth**: `budgetIncomeStreams` JSON blob on `Family` is retired. `GET /api/finance/income-streams` now reads live `FinanceIncomeEntry` records, deduplicated by `(name, entityId)`. `PUT /api/finance/income-streams` is a no-op stub kept for client compatibility.
- **Goals currentAmount**: derived server-side in the API layer (`account.currentBalance` when linked) — `FinanceSavingsGoal.currentAmount` remains the stored fallback for manual goals, untouched by the API when an account is linked.
- **Pending balance**: computed at query time in the accounts API using `financeTransaction.aggregate` — not stored, always fresh.
- **Cash vs forecast**: purely a client-side filter on the already-fetched bill/income lists — no separate API endpoints needed.
- **Quick-filter on bills**: local state in the bills page component; `QuickFilter` type defined at module level so `BillRow` (child component) can reference it via the `onQuickFilter` prop.

#### Shared Finance Utilities
- `src/lib/finance-categories.ts`: `sortedCategoryList(cats)` — returns flat array sorted parents-then-children alphabetically; consumed by income, bills, transactions, and vendors pages

---

### Key Files — Finance Module

#### Migrations (chronological)
| Migration | Description |
|-----------|-------------|
| `20260508300000_add_finance_models` | Core finance schema |
| `20260508450000_finance_multi_entity` | Entity/fund support |
| `20260509000000_add_finance_bill_enhancements` | Bill enhancements |
| `20260509100000_add_bill_parent_id` | Bill occurrence chaining |
| `20260509400000_add_bill_attachments` | Bill file attachments |
| `20260510000000_add_vendors_budget_income` | Vendors, budget, income |
| `20260511000000_add_finance_entities` | Entities |
| `20260511200000_add_income_entries` | Income entry model |
| `20260512000000_fix_income_location_cascade` | Cascade fix |
| `20260513000000_add_income_parity_fields` | Income parity with bills |
| `20260514000000_add_income_transaction_link` | Income/bill → transaction FK |
| `20260515000000_add_transaction_entity` | `entityId` on FinanceTransaction |
| `20260516000000_add_income_tax_tracking` | `isTaxTracked`/`taxRate` on FinanceIncomeEntry *(latest)* |

#### API Routes
| Route | Key behaviours |
|-------|----------------|
| `api/finance/accounts/route.ts` | GET enriches each account with `pendingCount`, `pendingExpense`, `pendingIncome` |
| `api/finance/income/route.ts` | POST/PUT accept `isTaxTracked`/`taxRate`; GET returns them automatically |
| `api/finance/income-streams/route.ts` | GET derives streams from live `FinanceIncomeEntry` records (includes `isTaxTracked`/`taxRate`); PUT is no-op stub |
| `api/finance/bills/route.ts` | PATCH accepts backdatable `paidDate`; auto-creates/deletes expense transaction |
| `api/finance/transactions/route.ts` | CRUD; GET filters by `entityId`; all responses include `entity` relation |
| `api/finance/goals/route.ts` | GET/PUT derive `currentAmount` from `account.currentBalance` when account linked |
| `api/finance/categories/route.ts` | GET includes `_count` for transactions, recurringBills, incomeEntries |
| `api/finance/members/route.ts` | GET includes `_count` for bills, income, transactions |
| `api/finance/locations/route.ts` | GET includes `_count` for transactions, recurringBills, incomeEntries |
| `api/finance/vendors/route.ts` | Vendor CRUD; `_count` for recurringBills and transactions |

#### Pages
| Page | Key changes in this build |
|------|--------------------------|
| `finance/income/page.tsx` | Tax tracking toggle + rate input in form; orange "TAX TRACKED" pill on rows; half-yearly frequency option added |
| `finance/profit-loss/page.tsx` | Estimated Tax card (orange); auto-calculated ATO liability from tax-tracked income; net profit subtracts estimated tax |
| `finance/reports/page.tsx` | Cash/Forecast toggle; label changes between "Paid bills" and "Expected bills" |
| `finance/budget/page.tsx` | Income section reads from Income page (read-only); removed all income CRUD |
| `finance/goals/page.tsx` | Account-linked goals show live balance; current amount field disabled when linked |
| `finance/transactions/page.tsx` | Entity filter + field added; entity chip on row |
| `finance/accounts/page.tsx` | Pending transaction count and amounts shown on account cards |
| `finance/bills/page.tsx` | Clickable vendor/member/location chips; quick-filter badge in filter bar |
| `finance/vendors/page.tsx` | Description text updated |
| `finance/categories/page.tsx` | Usage counts displayed under each category name |
| `finance/members/page.tsx` | Usage counts displayed under each member email |
| `finance/locations/page.tsx` | Usage counts displayed in each location card |

#### Shared Utilities
- `src/lib/finance-categories.ts`: `sortedCategoryList()` — alphabetically sorted parents-then-children

---

### What Was Intentionally Not Changed

| Item | Reason |
|------|--------|
| Account balance = all transactions (not cleared-only) | Clearing individual transactions is the correct workflow; clearing balance is shown as a diff, not the primary figure |
| `budgetIncomeStreams` column on Family table | Left in schema as nullable; no longer written to; safe to ignore or remove in a future migration if desired |
| Custom date range on Reports/P&L | Scope was limited to the priority fixes; calendar month/quarter/year remains |
| Income page "Add income" form removed from Budget | By design — single entry point is the Income page; Budget is read-only for income |

---

### Deployment

#### Development (Windows)
```bash
npm install
cp env.local.example .env.local
npx prisma migrate deploy
npx prisma generate
npm run dev   # http://localhost:3300
```

#### Production (NAS via Docker)
```bat
deploy-build.bat          # Windows: build image, save tar, SCP to NAS
sudo sh deploy-nas.sh     # NAS SSH: load image, restart container
```

Migrations run automatically at container start via `docker/entrypoint.sh` — this includes the new `20260516000000_add_income_tax_tracking` migration which adds `isTaxTracked` and `taxRate` to `FinanceIncomeEntry`, and the `20260515000000_add_transaction_entity` migration which adds `entityId` to `FinanceTransaction`.

---

### Commit History Summary

| Commit | Description |
|--------|-------------|
| **Half-Yearly Income Frequency** *(current)* | Added `halfyearly` frequency option to recurring income entries — schema docs, API helpers (`advanceNextExpectedDate`, `streamToMonthly`, `mapFrequency`), UI dropdown, budget planner, and P&L report all updated. Value `halfyearly` consistent with existing Chore model. |
| **Income Tax Tracking — ATO Compliance** | `isTaxTracked`/`taxRate` on FinanceIncomeEntry (migration `20260516000000`); tax toggle + rate input in income form; orange "TAX TRACKED" pill on income rows; auto-calculated estimated tax in P&L report; orange Estimated Tax card and expenses line |
| **Finance — Accounting Fixes & UX Parity** | P&L cash/forecast toggle; Reports cash/forecast toggle; budget income → single source of truth (FinanceIncomeEntry); goals auto-progress from account balance; entity field on transactions (migration `20260515000000`); pending vs cleared balance on accounts; usage counts on categories/members/locations; vendor description fix; clickable reference data on bills (quick-filter) |
| Finance — Income Accuracy & Category Sorting | Date-received/date-paid dialogs with backdating; auto-create FinanceTransaction on receipt/payment with undo; fixed overdue grace-period logic; cash-basis P&L; sorted+grouped category dropdowns; migration `20260514000000` |
| Finance — Income Tracking & P&L | FinanceIncomeEntry model, income CRUD API, income page, received history, P&L report |
| Collapsible Root Categories | Per-root collapse/expand toggle; "Not In Use" auto-collapsed |
| Dashboard Rolling Forward | Chore schedule card, todo per-user assignment, scope selectors |
| AI Voice & Chat Assistant | Multi-provider (Gemini + DeepSeek), 19 actions, PWA support |
| Apple Themes | 5 additive Apple-system themes |
| Phase 7 | Tags, categories, notes, PIN protection, audit log, UI enhancements |
| Phases 1–6 | Calendar, lists, recipes, meal planning, auth, Docker deployment |

---

### Project Status
- ✅ Finance — cash/forecast P&L and Reports, single-source income, goals from account balance, entity on transactions, pending balances, usage counts, clickable quick-filter on bills
- ✅ Income Tax Tracking — `isTaxTracked`/`taxRate` on income entries; tax toggle + rate in UI; "TAX TRACKED" pill; auto-calculated estimated tax in P&L
- ✅ Half-Yearly Income Frequency — `halfyearly` option added across income entry schema, all APIs, UI dropdown, budget planner, and P&L report calculations
- ✅ Migration `20260516000000_add_income_tax_tracking` created and applied (runs automatically via entrypoint)
- ✅ TypeScript: no breaking type changes introduced
- ✅ Docker/NAS: no new `/data` subdirectories required; existing entrypoint unchanged
