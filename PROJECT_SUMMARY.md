# HomeBase — Project Summary
## Current Build: Finance Module Completion — FY Setting, COA, Opening Balances, Balance Derivation

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

#### 12. Finance Module ← *most recently enhanced — Tax Reporting & Annual P&L*

Full household finance tracking — bills, income, transactions, accounts, budget, P&L, annual P&L, tax report, reports, vendors, categories, entities, locations, members.

Complete ATO tax compliance support:
- Australian tax brackets (2025-26) + Medicare levy calculated in the page component (easy to update each July without redeployment)
- Per-person tax workings (Mark / Michelle) — wages, joint interest split, deductions, PAYG credits, refund/owing
- Super contributions cap tracker per person (SGC + voluntary)
- Super entity P&L at 15% flat rate; Company/Trust entity P&L at 30% flat rate
- Quarterly BAS instalment estimates for business entities
- Data tagging guide shown when no tax data is set up yet

---

### Finance Module — Full Feature Reference

#### Accounts
- Checking, savings, credit, cash, investment, loan, entity accounts
- `currentBalance` updates automatically on every transaction create/edit/delete
- **Pending vs cleared split**: account cards show pending transaction count, uncleared expense total, and uncleared income total in amber

#### Bills & Recurring Expenses
- Recurring and one-off bill tracking with due-date management
- Mark paid — **date-paid confirmation dialog** (defaults to today, fully backdatable)
- **Auto-creates a `FinanceTransaction` (expense)** on payment so account balances and transaction feed stay accurate
- Undo paid: reverses the auto-created transaction and removes the spawned next occurrence
- Invoice/document attachment support (PDF, JPG, PNG, DOC — max 2 per bill)
- Budget planner integration via "Include in budget" checkbox on form
- Fields: entity/fund, category, vendor, account, member, location, notes, email reminder
- **Tax Classification** (tax_deduction / tax_payment / null) — optional, never blocks saving
- **Clickable reference data**: vendor, member, and location names are clickable quick-filter badges

#### Income Tracking
- Recurring and one-off income entries
- Frequency options: weekly, fortnightly, monthly, quarterly, 6 Monthly / Half-Yearly, yearly
- Mark as received — **date-received confirmation dialog** (defaults to today, fully backdatable)
- **Auto-creates a `FinanceTransaction` (income)** on receipt so account balances stay accurate
- Fixed overdue logic: freshly-spawned child entries get a grace period before being flagged overdue
- Remittance/payslip attachment support (max 2 per entry)
- Fields: entity/fund, category, vendor, account, member, location, notes, email reminder
- **Income Tax Tracking**: `isTaxTracked`, `taxRate`, `taxClassification` — orange "TAX TRACKED" pill on rows; amber warning when member not assigned for tax-tracked income

#### Transactions
- Full CRUD; filters by type, member, location, entity
- **Tax Classification** (tax_deduction / tax_payment / taxable_income / exempt_income / null) — shown for all types including transfer, with type-appropriate options; never blocks saving
- **isTransfer flag**: marks inter-entity fund movements excluded from P&L totals and tax calculations
- Entity chip displayed on transaction row (non-default entities only)
- Auto-created transactions from bill payment / income receipt linked via `recurringBillId` / source relations

#### Budget Planner
- Entity tabs isolate income and expenses per fund/entity
- **Single source of truth for income**: derived live from `FinanceIncomeEntry` records — no double-entry
- Expected costs section: bills flagged "include in budget" appear automatically
- Monthly / Yearly toggle on summary cards; List and By Category views

#### Profit & Loss (Monthly/Quarterly/Yearly)
- **Cash / Forecast toggle**:
  - **Cash mode**: paid bills by `paidDate` + received income by `receivedDate` + actual transactions — true cash statement
  - **Forecast mode**: adds pending bills by `nextDueDate` + pending income by `nextExpectedDate`
- **Actual transactions now included** — income-type and expense-type transactions always appear regardless of mode; transfers excluded
- Period controls: month / quarter / year with prev/next navigation
- Category breakdown with bar-chart percentages; drill-down to individual items showing source (bill, income entry, or transaction)
- **Estimated Tax (ATO)** — auto-calculates from tax-tracked income entries; orange summary card; net profit subtracts estimated tax

#### Annual P&L — NEW
- **12-column Jul–Jun financial year table** matching the NETT budget spreadsheet layout
- FY navigator (← FY2025–26 →) to browse historical years
- Cash mode: only confirmed paid/received items populate each month column
- Forecast mode: recurring bills/income spread as monthly equivalents; actual transactions always show
- Income section + expense section each with category rows and colour dots
- **NET row** at bottom — green/positive, red/negative per month
- Current month column highlighted in the table
- Entity filter pills; compact `$12k` / `$1.2M` formatting for column values
- Footer note explaining Cash vs Forecast behaviour

#### Tax Report — NEW
- **Per-person ATO workings** (Mark / Michelle panels side by side):
  - Gross income lines: wages/salary, joint bank interest (split equally), other income, franking credits
  - Deductions: voluntary super, charity/gifts, other deductions
  - Total Taxable Income + per-week equivalent
  - Tax Calculation: income tax (2025-26 brackets), Medicare levy, less franking credits offset
  - Tax Already Paid: PAYG withheld, PAYG instalments, franking offset
  - **Refund / Owing box** (green = refund, red = owing)
  - **Super cap tracker**: SGC + voluntary vs $30,000 cap with progress bar; amber at 90%, red if over
- **Combined refund/owing** row below panels (sum of all members)
- **Joint income section**: income entries with no member assigned, split equally across all members
- **Super fund entity section** (15% flat rate): income, expenses, taxable income, tax payable, PAYG paid, refund/owing, quarterly BAS estimate
- **Company/trust entity section** (30% flat rate): same layout
- Tax brackets live in the page component — update one file each July, no redeployment needed
- ATO disclaimer banner; FY label from API
- **Data tagging guide**: full 4-step numbered checklist shown when no tax data is found, linking to relevant pages

#### Reports
- **Cash / Forecast toggle**: matches P&L semantics
- View by Category or by Vendor; period controls with drill-down

#### Savings Goals
- **Auto-progress from account balance**: `currentAmount` derived from `account.currentBalance` when linked
- Manual tracking for goals without a linked account

#### Categories
- Hierarchical (parent / child, 2 levels); income / expense / transfer types
- **Tax deduction flag**: expense and transfer categories
- **Tax reporting flag** (`taxIncludeInReporting`): **all types** including transfer — marks categories for Tax Report inclusion
- **Tax display label** (`taxDisplayLabel`): custom override label in Tax Report
- **TAX DED / TAX RPT badges** with distinct colours (orange/amber) on category rows
- Usage counts per category

#### Entities
- **Type controls tax rate in Tax Report**: superfund → 15%, business/trust → 30%, personal → individual brackets
- **Amber info banner** on Entities page explaining tax rate impact
- **Type hint** shown below Type dropdown in edit dialog when a taxed type is selected
- **Tax rate badge** on each entity card in the list
- Deactivate/reactivate; sort order; colour picker

#### Members / Locations / Vendors
- Usage counts displayed inline; vendor description covers both payees and payers

---

### Technical Architecture

#### Database Schema (Prisma) — Finance Models
- **FinanceCategory**: `taxIncludeInReporting` (boolean, all types), `taxDisplayLabel` (nullable string)
- **FinanceTransaction**: `taxClassification` (nullable string), `isTransfer` (boolean, default false)
- **FinanceRecurringBill**: `taxClassification` (nullable string)
- **FinanceIncomeEntry**: `isTaxTracked` (boolean), `taxRate` (nullable float), `taxClassification` (nullable string)
- All others unchanged from previous build

#### Tax Classification Values
| Record type | Valid values |
|---|---|
| `FinanceTransaction` (expense/transfer) | `tax_deduction`, `tax_payment`, null |
| `FinanceTransaction` (income) | `taxable_income`, `exempt_income`, null |
| `FinanceRecurringBill` | `tax_deduction`, `tax_payment`, null |
| `FinanceIncomeEntry` | `taxable_income`, `exempt_income`, null |

#### Key Design Decisions
- **Tax brackets in page component, not API**: `calcIncomeTax()`, `calcMedicare()`, `SUPER_CAP` all live in `tax-report/page.tsx`. Update one file each July, no API change or redeployment needed.
- **isTransfer = false filter on P&L**: transfers excluded from all income/expense totals to avoid double-counting. Transfers can still carry `taxClassification` (e.g. voluntary super contributions recorded as a transfer).
- **Joint income split**: income entries with no `memberId` on a default/personal entity are split equally across all family members in the Tax Report.
- **Entity type → tax rate**: detected by `entity.type` field. `superfund` → 15%, `business`/`trust` → 30%, others → individual brackets. Set via Finance → Entities.
- **taxClassification always optional**: removed from all `validate()` functions across Bills, Income, Transactions modals. None block saving if unset.
- **Annual P&L data flow**: fetches all bills + income on mount (static), fetches transactions for the full FY on FY/entity change (dynamic). Recurring items spread as monthly equivalents in Forecast; actual transactions always appear in their actual month.

#### Shared Finance Utilities
- `src/lib/finance-categories.ts`: `sortedCategoryList()` — alphabetically sorted parents-then-children

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
| `20260516000000_add_income_tax_tracking` | `isTaxTracked`/`taxRate` on FinanceIncomeEntry |
| `20260517000000_add_tax_classification` | `taxClassification` on Transaction/Bill/Income; `taxIncludeInReporting`/`taxDisplayLabel` on Category |
| `20260519000000_add_is_transfer` | `isTransfer BOOLEAN NOT NULL DEFAULT false` on FinanceTransaction *(latest)* |

#### API Routes
| Route | Key behaviours |
|-------|----------------|
| `api/finance/accounts/route.ts` | GET enriches with `pendingCount`, `pendingExpense`, `pendingIncome` |
| `api/finance/bills/route.ts` | `taxClassification` in POST/PUT/PATCH; PATCH auto-creates expense transaction, spawns next occurrence |
| `api/finance/income/route.ts` | `taxClassification`, `isTaxTracked`, `taxRate` in POST/PUT/PATCH; PATCH auto-creates income transaction |
| `api/finance/transactions/route.ts` | `taxClassification`, `isTransfer` in GET/POST/PUT; entity filter; `startDate`/`endDate` query params for P&L/annual-pnl |
| `api/finance/categories/route.ts` | `taxIncludeInReporting`, `taxDisplayLabel` in POST/PUT; `_count` in GET |
| `api/finance/tax-report/route.ts` | Returns raw financial data only — members, entities, transactions (with `category` include), income entries (with `category` include), taxCategories. No bracket calculations — all done in page. |
| `api/finance/pnl/route.ts` | GET fetches bills + income entries + actual transactions for period; merges income-type and expense-type transactions into category groups |
| `api/finance/goals/route.ts` | GET/PUT derive `currentAmount` from `account.currentBalance` when account linked |
| `api/finance/members/route.ts` | `_count` for bills, income, transactions |
| `api/finance/locations/route.ts` | `_count` for transactions, recurringBills, incomeEntries |

#### Pages
| Page | Status / Key changes |
|------|----------------------|
| `finance/tax-report/page.tsx` | **Full rewrite** — per-person panels (Mark/Michelle); joint income split; tax brackets in page; super cap per person; entity sections (15%/30%); combined refund/owing; data tagging guide on empty state |
| `finance/annual-pnl/page.tsx` | **NEW** — 12-column Jul–Jun FY table; FY navigator; Cash/Forecast toggle; Income + Expense sections by category; NET row; current month highlight; entity filter |
| `finance/profit-loss/page.tsx` | **Updated** — now fetches actual transactions separately (keyed on period dates + entity); income-type and expense-type transactions always included in both Cash and Forecast modes; transactions loading indicator |
| `finance/entities/page.tsx` | **Updated** — amber Tax Report type hint banner; tax rate hint in edit dialog; tax rate badge on entity cards |
| `finance/categories/page.tsx` | **Updated** — `taxIncludeInReporting` now shows for ALL types including transfer; TAX DED/TAX RPT badges with distinct colours |
| `finance/transactions/page.tsx` | **Updated** — Tax Classification dropdown shows for all types including transfer; type change clears taxClassification; TRANSFER badge in list |
| `finance/income/page.tsx` | `taxClassification` optional (removed from validate); tax tracking UI unchanged |
| `finance/bills/page.tsx` | `taxClassification` optional (removed from validate) |
| `finance/layout.tsx` | **Annual P&L** tab added between P&L and Tax Report |

---

### Tax Report — Data Setup Requirements

For the Tax Report to show meaningful figures, the following data must be tagged:

| Data | Where to tag | What to set |
|---|---|---|
| Salary/wages | Finance → Income | `isTaxTracked=true`, `taxClassification=taxable_income`, `memberId` set, name contains "Salary" or "Wages" |
| Other personal income | Finance → Income | `isTaxTracked=true`, `taxClassification=taxable_income`, `memberId` set |
| Joint bank interest | Finance → Income | `isTaxTracked=true`, no `memberId` (joint split happens automatically) |
| PAYG withholding | Finance → Transactions | `taxClassification=tax_payment`, `memberId` set |
| Voluntary super | Finance → Transactions or Bills | `taxClassification=tax_deduction`, category name contains "Super" |
| Super fund income | Finance → Income | `entityId` = super fund entity |
| Entity types | Finance → Entities | superfund → "Super Fund"; Unitrak → "Business" or "Trust" |

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

Migrations run automatically at container start via `docker/entrypoint.sh`. The latest migrations are:
- `20260517000000_add_tax_classification` — adds `taxClassification` to Transaction/Bill/Income; `taxIncludeInReporting`/`taxDisplayLabel` to Category
- `20260519000000_add_is_transfer` — adds `isTransfer BOOLEAN NOT NULL DEFAULT false` to FinanceTransaction
- `20260520000000_add_finance_year_start` — adds `financeYearStartMonth` to Family model
- `20260520100000_add_opening_balances` — adds `openingBalanceTxId` to FinanceAccount, `openingBalancesCategoryId` to Family

> **Build/deploy reference guide saved at [`.roo/prompts/build-deploy-guide.md`](.roo/prompts/build-deploy-guide.md)** — always check this when schema changes are involved.

---

### Commit History Summary

| Commit | Description |
|--------|-------------|
| **Build/deploy guide & migration checklist** | Added `.roo/prompts/build-deploy-guide.md` documenting the Docker build pipeline and auto-migration flow to prevent schema drift between dev and production. |
| **Tax Reporting, Annual P&L & ATO Workings** | Per-person Tax Report with ATO brackets in page component; Annual FY P&L 12-column table; P&L includes actual transactions; transfer taxClassification; entity type hints; data tagging guide. Migrations: `20260517000000_add_tax_classification`, `20260519000000_add_is_transfer`. |
| **Half-Yearly Income Frequency** | Added `halfyearly` frequency option to recurring income entries |
| **Income Tax Tracking — ATO Compliance** | `isTaxTracked`/`taxRate` on FinanceIncomeEntry; tax toggle + rate in income form; estimated tax in P&L |
| **Finance — Accounting Fixes & UX Parity** | P&L cash/forecast; budget single source of truth; goals auto-progress; entity on transactions; pending balances; usage counts |
| **Finance Module Completion (FY Setting, COA, Opening Balances)** | Financial Year start month setting; Chart of Accounts rename + new types (asset/liability/equity); opening balances double-entry; currentBalance derivation from transactions |
| Finance — Income Accuracy & Category Sorting | Date dialogs; auto-create transactions; overdue grace period; cash-basis P&L |
| Finance — Income Tracking & P&L | FinanceIncomeEntry model, income CRUD, P&L report |
| Collapsible Root Categories | Per-root collapse/expand; "Not In Use" auto-collapsed |
| Dashboard Rolling Forward | Chore schedule card, todo per-user assignment |
| AI Voice & Chat Assistant | Multi-provider (Gemini + DeepSeek), 19 actions, PWA support |
| Apple Themes | 5 additive Apple-system themes |
| Phase 7 | Tags, categories, notes, PIN protection, audit log |
| Phases 1–6 | Calendar, lists, recipes, meal planning, auth, Docker deployment |

---

### Project Status
- ✅ Tax Report — per-person ATO workings, joint income split, super cap, entity sections (15%/30%), data tagging guide
- ✅ Annual P&L — 12-column FY table, FY navigator, Cash/Forecast, NET row, entity filter
- ✅ P&L — actual transactions included alongside bills/income entries
- ✅ Transfer taxClassification — dropdown now shows for all transaction types including transfers
- ✅ Categories — taxIncludeInReporting available for all types including transfer
- ✅ Entities — tax rate hints and type guide on page and in dialog
- ✅ taxClassification optional in all modals — no longer blocks saving on Bills, Income, Transactions
- ✅ Migrations `20260517000000` and `20260519000000` created; deploy automatically via entrypoint
- ✅ TypeScript: build passes, no breaking type changes
- ✅ Docker/NAS: entrypoint runs both new migrations on startup

### Finance Module Completion (2026-05-10)
- ✅ **Financial Year Start Setting** — Configurable FY start month (1-12) stored on Family; shared FY utility library (`finance-fy.ts`) with `fyDateRange`, `fyLabel`, `fyMonthLabels`, `currentFyYear` etc.; all P&L, tax-report, annual-pnl pages consume the setting
- ✅ **Chart of Accounts** — Nav tab renamed "Categories" → "Chart of Accounts"; new COA types `asset`, `liability`, `equity` with badge colours; internal code still uses `category`/`categoryId`
- ✅ **Opening Balances (Double-Entry)** — New equity "Opening Balances" system category; `setOpeningBalance()` creates/updates/deletes `opening_balance` type transactions; opening balance fields on account creation form
- ✅ **currentBalance Derivation** — `deriveAccountBalance()` and `deriveAllAccountBalances()` compute balance from cleared transactions; all Overview/goals/accounts pages use derived balance; stored `currentBalance` field no longer trusted
- ✅ **Opening Balance Exclusion** — All P&L/report queries filter `type: { not: 'opening_balance' }`; transactions page shows "Opening Balance" badge with purple indicator
- ✅ **Email & Excel Reports** — `buildYtdReport` receives `fyStartMonth` from family settings
- ✅ **Build** — `prisma generate` ✓, `prisma migrate deploy` ✓ (both migrations: `20260520000000_add_finance_year_start`, `20260520100000_add_opening_balances`), `tsc --noEmit` ✓
- ✅ **Migrations** — 3 new migrations total: `20260519000000_add_is_transfer`, `20260520000000_add_finance_year_start`, `20260520100000_add_opening_balances` (UNIQUE index fixed for SQLite compat)
- ✅ **Docker/NAS** — `docker/entrypoint.sh` unchanged (runs `prisma migrate deploy` on startup)
