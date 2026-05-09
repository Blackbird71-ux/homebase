# HomeBase — Project Summary
## Current Build: Finance Module — Income Accuracy & Category Sorting

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

Full household finance tracking — bills, income, transactions, accounts, budget, P&L, vendors, categories, entities, locations.

##### Bills & Recurring Expenses
- Recurring and one-off bill tracking with due-date management
- Mark paid — **date-paid confirmation dialog** (defaults to today, fully backdatable)
- **Auto-creates a `FinanceTransaction` (expense)** on payment so account balances and transaction feed stay accurate (cash-basis)
- Undo paid: reverses the auto-created transaction and removes the spawned next occurrence
- Invoice/document attachment support (PDF, JPG, PNG, DOC — max 2 per bill)
- Budget planner integration; entity/fund, category, vendor, account, member, location fields

##### Income Tracking
- Recurring and one-off income entries
- Mark as received — **date-received confirmation dialog** (defaults to today, fully backdatable)
  - User picks the actual bank-credit date, preventing wrong-period P&L entries
  - **Auto-creates a `FinanceTransaction` (income)** on receipt so account balances stay accurate
  - Undo receipt: reverses the auto-created transaction and removes the spawned next occurrence
- **Fixed overdue logic**: freshly-spawned child entries (created by mark-received) get a grace period equal to one full pay cycle before being flagged overdue — the "pay received → immediately overdue again" bug is resolved
- Remittance/payslip attachment support (max 2 per entry)
- Payer/source via the Vendors list — same vendor can appear on both bills (payee) and income (payer), e.g. CoGB for both rates and salary

##### Category Dropdowns — Sorted & Grouped (all finance pages)
All category `<select>` elements across the finance module now:
- **Sort alphabetically**: parent roots A→Z, children A→Z under each parent
- **Indent children** with an em-dash prefix (`— Sub-category`)
- **Vendors page**: default-category dropdown now shows all three types (Income / Expense / Transfer) in labelled `<optgroup>` sections — previously only showed expense categories, making it impossible to assign an income category to a payer
- **Income page**: filtered to income-type only, sorted
- **Bills page**: filtered to expense-type only, sorted
- **Transactions page**: filtered to the selected transaction type, sorted
- Column-picker ("Show category columns") on income and bills pages also scoped to the correct type
- Shared utility: `src/lib/finance-categories.ts` — `sortedCategoryList()` used by all four pages

##### Profit & Loss Report
- **Cash-basis date matching**: received income slots into a period by `receivedDate`; paid bills slot by `paidDate`
- Pending items continue to use expected/due date for forward-looking forecast
- Drill-down items show the actual received/paid date
- Period controls: month / quarter / year with prev/next navigation; category breakdown with bar-chart percentages

##### Migration: `20260514000000_add_income_transaction_link`
- Adds nullable `transactionId` FK to `FinanceIncomeEntry` and `FinanceRecurringBill`
- Adds reverse relations `sourceIncomeEntry` / `sourceBill` on `FinanceTransaction`
- Runs automatically at container startup via `prisma migrate deploy`

##### Docker / NAS
- `docker/entrypoint.sh` now creates `/data/income-attachments` on startup alongside other storage directories

---

### Technical Architecture

#### Database Schema (Prisma) — Finance Models
- **FinanceAccount**: Bank accounts, credit cards, savings, investment accounts
- **FinanceCategory**: Hierarchical income/expense/transfer categories (parent/child, 2 levels)
- **FinanceTransaction**: Individual transactions; auto-created on bill payment / income receipt; `sourceIncomeEntry` and `sourceBill` reverse relations for traceability
- **FinanceRecurringBill**: Bills with `transactionId` FK → auto-created expense transaction; `parentBillId` for occurrence chaining
- **FinanceIncomeEntry**: Income with `parentIncomeId` self-reference for occurrence chaining and `transactionId` FK → auto-created income transaction
- **FinanceBudget**: Budget rules linked to bills and categories
- **FinanceSavingsGoal**: Savings goals linked to accounts
- **FinanceVendor**: Vendors/payers shared across bills and income
- **FinanceEntity**: Funds/entities (Super Fund, Trust, Business, etc.)
- **FinanceLocation**: Property/location tags for bills and income
- **BillAttachment / IncomeAttachment**: File attachments

#### Shared Finance Utilities
- `src/lib/finance-categories.ts`: `sortedCategoryList(cats: FlatCategory[])` — returns flat array sorted parents-then-children alphabetically; consumed by income, bills, transactions, and vendors pages

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
| `20260514000000_add_income_transaction_link` | Income/bill → transaction FK *(latest)* |

#### API Routes
- `src/app/api/finance/income/route.ts` — PATCH accepts backdatable `receivedDate`; auto-creates/deletes income transaction
- `src/app/api/finance/income/received/route.ts` — received income history
- `src/app/api/finance/bills/route.ts` — PATCH accepts backdatable `paidDate`; auto-creates/deletes expense transaction
- `src/app/api/finance/transactions/route.ts` — transaction CRUD
- `src/app/api/finance/categories/route.ts` — category CRUD with hierarchy validation
- `src/app/api/finance/vendors/route.ts` — vendor CRUD

#### Pages
- `src/app/(app)/finance/income/page.tsx` — overdue fix, date-received dialog, income-only sorted categories
- `src/app/(app)/finance/income/received/page.tsx` — received income history
- `src/app/(app)/finance/bills/page.tsx` — date-paid dialog, expense-only sorted categories
- `src/app/(app)/finance/profit-loss/page.tsx` — cash-basis P&L with period navigation and drill-down
- `src/app/(app)/finance/transactions/page.tsx` — sorted/type-filtered category dropdown
- `src/app/(app)/finance/vendors/page.tsx` — all-type category dropdown with optgroups

#### Shared Utilities
- `src/lib/finance-categories.ts` — `sortedCategoryList()` *(new)*

---

### Deployment

#### Development
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
Migrations run automatically at container start via `docker/entrypoint.sh`.

---

### Commit History Summary

| Commit | Description |
|--------|-------------|
| **Finance — Income Accuracy & Category Sorting** *(current)* | Date-received/date-paid dialogs with backdating; auto-create FinanceTransaction on receipt/payment with undo; fixed overdue grace-period logic; cash-basis P&L; sorted+grouped category dropdowns across all finance pages; vendors shows all category types in optgroups; `finance-categories.ts` utility; `/data/income-attachments` in entrypoint; migration `20260514000000` |
| Finance — Income Tracking & P&L | FinanceIncomeEntry model, income CRUD API, income page, received history, P&L report |
| Collapsible Root Categories | Per-root collapse/expand toggle; "Not In Use" auto-collapsed |
| Dashboard Rolling Forward | Chore schedule card, todo per-user assignment, scope selectors |
| AI Voice & Chat Assistant | Multi-provider (Gemini + DeepSeek), 19 actions, PWA support |
| Apple Themes | 5 additive Apple-system themes |
| Phase 7 | Tags, categories, notes, PIN protection, audit log, UI enhancements |
| Phases 1–6 | Calendar, lists, recipes, meal planning, auth, Docker deployment |

### Project Status
- ✅ Finance — income accuracy, cash-basis P&L, category sorting complete
- ✅ Migration `20260514000000_add_income_transaction_link` ready for deploy
- ✅ TypeScript: no type errors
- ✅ Production build compiles successfully
- ✅ Docker/NAS: entrypoint creates all required `/data` subdirectories including `/data/income-attachments`
