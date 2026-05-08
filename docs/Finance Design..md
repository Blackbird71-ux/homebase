🏠 Homebase
Finance Module
Design & Implementation Specification
Version 1.0  •  May 2026


1. Overview & Goals
The Finance Module adds comprehensive personal and household money management to Homebase. It is designed for families and individuals who need a fast, frictionless way to track bills and spending, build and monitor budgets, and understand their financial health through clear reports — all without leaving the Homebase ecosystem they already use.

Design principles:
•	Speed first — enter a bill in under 10 seconds from any screen
•	Family-aware — shared visibility with optional personal/private transactions
•	Frictionless categorisation — smart auto-suggest based on payee history
•	Zero lock-in — full CSV/Excel export at any time
•	Consistent with existing Homebase UX — same design system, sidebar navigation, and auth patterns

2. Navigation & Entry Points
Add a new "Finance" item to the existing sidebar (Sidebar.tsx) with a Wallet or DollarSign icon from lucide-react. Position it after "Chores" and before "Contacts". The Finance area is a top-level route: /finance.

Sub-pages within /finance:
Route	Page	Description
/finance	Dashboard	Monthly summary, upcoming bills, budget ring charts
/finance/bills	Bills & Expenses	Full transaction list with quick-add
/finance/budgets	Budgets	Create and manage monthly/custom budgets per category
/finance/recurring	Recurring Bills	Manage subscriptions and regular payments
/finance/accounts	Accounts	Track bank accounts, credit cards, cash balances
/finance/reports	Reports	Spending charts, trends, category breakdowns
/finance/categories	Categories	Manage expense/income categories

💡 Quick-add for finance should also be wired into the global QuickAdd (⌘K) dialog alongside existing list/event shortcuts.

3. Database Schema (Prisma)
All new models are added to the existing prisma/schema.prisma and follow Homebase conventions: SQLite (better-sqlite3), cuid() IDs, familyId foreign key on every family-scoped model, createdAt timestamps, audit log entries for mutations.

3.1 FinanceAccount
Represents a bank account, credit card, savings account, or cash wallet.
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
name	String	e.g. "ANZ Everyday", "Visa Card"
type	String	checking | savings | credit | cash | investment | loan
institution	String?	Bank or institution name
currency	String	Default "AUD"
currentBalance	Float	Current balance (manually maintained)
creditLimit	Float?	For credit cards
isActive	Boolean	Default true
color	String?	Display colour hex
icon	String?	lucide icon name
sortOrder	Int	Display order
createdAt	DateTime	Auto
updatedAt	DateTime	@updatedAt

3.2 FinanceCategory
User-customisable expense and income categories. Pre-seeded defaults on family creation.
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
name	String	e.g. "Groceries", "Utilities", "Car"
type	String	expense | income | transfer
icon	String?	lucide icon name
color	String?	Hex colour for charts/badges
isSystem	Boolean	Seeded defaults cannot be deleted
sortOrder	Int	Display order
parentId	String?	Self-ref for sub-categories (optional)
createdAt	DateTime	Auto

Default seeded categories (expense): Housing/Rent, Mortgage, Electricity, Gas, Water, Internet, Mobile Phone, Groceries, Dining Out, Coffee & Café, Car Loan, Fuel, Car Insurance, Registration, Parking, Public Transport, Health Insurance, Medical/Dental, Pharmacy, Childcare, School Fees, Clothing, Personal Care, Streaming Services, Other Subscriptions, Entertainment, Holidays/Travel, Gym & Fitness, Pet Care, Gifts, Charity, Household Supplies, Home Maintenance, Home Insurance, Life Insurance, Savings Transfer, Credit Card Payment, Other Expense.
Default seeded categories (income): Salary/Wages, Freelance/Contractor, Investment Return, Rental Income, Government Benefit, Tax Return, Other Income.

3.3 Transaction
The core record — every bill, expense, or income entry.
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
accountId	String?	FK → FinanceAccount (nullable = unbanked)
categoryId	String?	FK → FinanceCategory
type	String	expense | income | transfer
amount	Float	Always positive; sign implied by type
payee	String?	Who was paid / who paid you
description	String?	Optional longer note
date	DateTime	Transaction date
isRecurring	Boolean	Linked to a RecurringBill
recurringBillId	String?	FK → RecurringBill
tags	String?	JSON array of tag strings
isPrivate	Boolean	Only visible to createdBy user
createdBy	String	User.id
receiptPath	String?	Path to uploaded receipt image/PDF
notes	String?	Free text
createdAt	DateTime	Auto
updatedAt	DateTime	@updatedAt

3.4 RecurringBill
Defines a repeating bill or subscription. Instances are auto-created as Transactions when due.
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
accountId	String?	FK → FinanceAccount
categoryId	String?	FK → FinanceCategory
name	String	e.g. "Netflix", "Mortgage"
amount	Float	Expected amount
frequency	String	weekly | fortnightly | monthly | quarterly | annual
dayOfMonth	Int?	For monthly/quarterly (1–31)
monthOfYear	Int?	For annual (1–12)
nextDueDate	DateTime	Calculated next occurrence
endDate	DateTime?	Stop after this date
isActive	Boolean	Default true
autoPay	Boolean	Mark as paid automatically on due date
emailReminder	Boolean	Send email reminder
reminderDays	Int	Days before due to remind (default 3)
notes	String?	Free text
createdAt	DateTime	Auto
updatedAt	DateTime	@updatedAt

3.5 Budget
A monthly (or custom period) spending target for one or more categories.
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
name	String	e.g. "Groceries – May 2026"
categoryId	String?	FK → FinanceCategory (null = total budget)
amount	Float	Budget limit for the period
period	String	monthly | custom
startDate	DateTime	Period start
endDate	DateTime	Period end
rollover	Boolean	Carry unspent amount to next period
alertThreshold	Int	Notify at X% spent (default 80)
emailAlert	Boolean	Send email when threshold hit
createdAt	DateTime	Auto
updatedAt	DateTime	@updatedAt

3.6 SavingsGoal
Optional target amounts for savings milestones (holiday fund, emergency fund, etc.).
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
accountId	String?	Associated savings account
name	String	e.g. "Holiday to Japan 2027"
targetAmount	Float	Goal amount
currentAmount	Float	Running total (manual updates)
targetDate	DateTime?	Deadline
color	String?	Display colour
icon	String?	lucide icon
isComplete	Boolean	Default false
createdAt	DateTime	Auto
updatedAt	DateTime	@updatedAt

4. API Routes
Follow existing Homebase patterns: all routes under /api/finance/, use NextAuth session for auth, return JSON, use Prisma for DB access, include AuditLog entries on create/update/delete mutations.

Method	Route	Description
GET	/api/finance/accounts	List all accounts for family
POST	/api/finance/accounts	Create account
PATCH	/api/finance/accounts/[id]	Update account
DELETE	/api/finance/accounts/[id]	Delete account
GET	/api/finance/categories	List categories
POST	/api/finance/categories	Create custom category
PATCH	/api/finance/categories/[id]	Update category
DELETE	/api/finance/categories/[id]	Delete (non-system) category
GET	/api/finance/transactions	List with filters: dateFrom, dateTo, categoryId, accountId, type, search, page, limit
POST	/api/finance/transactions	Create transaction (quick or full)
PATCH	/api/finance/transactions/[id]	Update transaction
DELETE	/api/finance/transactions/[id]	Delete transaction
POST	/api/finance/transactions/import	Bulk CSV import
GET	/api/finance/recurring	List recurring bills
POST	/api/finance/recurring	Create recurring bill
PATCH	/api/finance/recurring/[id]	Update recurring bill
DELETE	/api/finance/recurring/[id]	Delete recurring bill
POST	/api/finance/recurring/[id]/pay	Mark next instance as paid
GET	/api/finance/budgets	List budgets, optionally with spent totals
POST	/api/finance/budgets	Create budget
PATCH	/api/finance/budgets/[id]	Update budget
DELETE	/api/finance/budgets/[id]	Delete budget
GET	/api/finance/savings-goals	List savings goals
POST	/api/finance/savings-goals	Create goal
PATCH	/api/finance/savings-goals/[id]	Update goal / add contribution
DELETE	/api/finance/savings-goals/[id]	Delete goal
GET	/api/finance/reports/summary	Monthly totals by category, net income
GET	/api/finance/reports/trends	Multi-month spending trend data
GET	/api/finance/reports/category	Drill-down for single category over period
GET	/api/finance/reports/cashflow	Income vs expense by month
GET	/api/finance/export	Export transactions as CSV or XLSX
GET	/api/finance/dashboard	Aggregated data for dashboard page

5. Page Specifications
5.1 Finance Dashboard (/finance)
The at-a-glance view. Loads data from /api/finance/dashboard which returns a single aggregated payload to minimise round-trips.

Layout — four sections stacked vertically on mobile, two-column grid on desktop:

Section A — Month Summary Bar
•	Current month name + year
•	Total income (green), total expenses (red), net (blue)
•	A subtle progress bar showing days elapsed in the month

Section B — Budget Ring Cards (horizontal scroll on mobile)
•	One card per active budget category
•	Circular progress ring (SVG) showing % spent
•	Category name, spent amount, budget limit
•	Colour: green <60%, amber 60–80%, red >80%
•	Tap/click → navigates to /finance/budgets with that category pre-selected

Section C — Upcoming Bills (next 14 days)
•	List of recurring bills sorted by nextDueDate
•	Shows: bill name, due date, amount, category icon
•	Overdue bills highlighted in red
•	"Mark as paid" button inline on each row

Section D — Recent Transactions (last 10)
•	Compact list: date, payee, category badge, amount
•	"View all" link → /finance/bills

Section E — Savings Goals (if any exist)
•	Horizontal progress bars with current/target and % complete
•	"Add contribution" quick button per goal

5.2 Bills & Expenses (/finance/bills)
The primary data entry and review screen. This must feel fast and frictionless.

Top bar:
•	Month/year picker (prev/next arrows + dropdown)
•	Filter chips: All | Expenses | Income | Recurring
•	Category filter dropdown
•	Account filter dropdown
•	Search box (searches payee + description)
•	Quick-Add button (primary, always visible) → opens inline drawer or modal

Transaction list:
•	Grouped by date (today, yesterday, then date headers)
•	Each row: category colour dot, payee, category name, account name, amount
•	Income rows in green, expense in standard foreground
•	Recurring indicator icon on auto-generated entries
•	Private indicator (lock icon) on private transactions
•	Tap row → expand inline to show description, tags, receipt thumbnail, edit/delete actions
•	Swipe left on mobile → quick delete with confirmation

Quick-Add Drawer (primary interaction):
Opening the quick-add should be achievable from any Finance page via the floating button or ⌘K. The drawer slides up from the bottom on mobile, appears as a side drawer on desktop.

Quick-Add fields:
•	Amount — large numeric input, auto-focused, supports decimal
•	Type toggle — Expense / Income / Transfer (3 tabs, expense pre-selected)
•	Category — icon-grid picker (8 most-used + "more" expander); auto-suggested based on payee history
•	Payee/Description — text input with autocomplete from previous payees
•	Date — defaults to today; tap to change via date picker
•	Account — dropdown of accounts (defaults to last used)
•	Save button — keyboard shortcut Enter
•	Expand link → opens full form with: notes, tags, receipt upload, recurring flag

💡 Auto-suggest category: when the user types a payee that was previously entered, the category field should auto-fill to the category most commonly used with that payee.

5.3 Recurring Bills (/finance/recurring)
Manage subscriptions and regular payments.

•	List of all recurring bills, grouped by frequency (monthly, annual, etc.)
•	Each card: bill name, category icon, amount, frequency, next due date, active/paused toggle
•	Total monthly cost summary at the top (normalises annual/quarterly to monthly equivalent)
•	"Add recurring bill" button → full form dialog
•	Mark-as-paid creates a Transaction and advances nextDueDate
•	Pause/resume without deleting the bill
•	Email reminder configuration per bill

5.4 Budgets (/finance/budgets)
Create and monitor spending limits by category.

•	Current month's budgets shown by default; period selector to browse other months
•	Budget cards: category icon + name, spent/limit bar, remaining amount or overspend amount
•	"Add budget" → form: category, amount, period (monthly auto-repeating or custom date range), rollover toggle, alert threshold
•	"Copy last month's budgets" convenience button
•	Auto-repeating budgets roll over each month automatically — new Budget records are created by a cron job (or on-demand when the page loads)
•	Total budget vs total spent summary card
•	Overspent categories sorted to top

5.5 Reports (/finance/reports)
Visual analytics. All charts rendered with a lightweight charting library (Recharts is already in package.json as recharts is used in the existing xlsx export; if not, use a simple canvas-based approach or SVG — do NOT add Chart.js).

Report tabs / sections:

Monthly Summary
•	Stacked bar chart: income vs expenses by month (last 12 months)
•	Net savings line overlay
•	Month selector to drill into a specific month

Category Breakdown
•	Donut chart of expenses by category for selected month
•	Table below chart: category, amount, % of total, vs prior month delta
•	Click category → drill-down list of transactions in that category

Spending Trends
•	Line chart per category over last 6 months
•	Category multi-select to compare lines

Cash Flow
•	Waterfall or grouped bar: income streams vs expense categories
•	Running balance line if accounts are configured

Annual Summary
•	Calendar heat map of spending intensity by day
•	Total income, total expenses, net savings, savings rate %
•	Top 5 spending categories

Export controls (top-right of every report):
•	Export as CSV — all transactions in current filter
•	Export as XLSX — formatted spreadsheet with summary sheet
•	Print-friendly view (CSS @media print)

5.6 Accounts (/finance/accounts)
•	List of accounts with current balance, account type badge, institution name
•	Total net worth calculation (assets − liabilities)
•	"Add account" button → form: name, type, institution, opening balance, colour, icon
•	Manual balance update: tap balance → enter new balance → saves a balance-adjustment Transaction
•	Each account card links to /finance/bills filtered to that account

5.7 Categories (/finance/categories)
•	Grid of category cards with icon and colour
•	Expense and Income tabs
•	Drag-to-reorder (dnd-kit already in package.json)
•	Add/edit: name, type, icon picker (lucide icons), colour picker
•	System categories can be renamed/recoloured but not deleted
•	Custom categories can be fully deleted (transactions are un-categorised, not deleted)

6. Global Quick-Add Integration
Extend the existing QuickAdd component (src/components/layout/QuickAdd.tsx) to include finance shortcuts:
•	Type "bill" or "$" in the ⌘K palette → opens finance quick-add drawer
•	Recent payees appear as quick-add suggestions in the palette
•	The mobile floating action button (FAB) should show a Finance icon option when on any /finance/* route

7. Notifications & Reminders
Extend the existing node-cron job / email system (already used by chores and events) for finance reminders:

•	Upcoming bill reminder — X days before nextDueDate (configurable per bill, default 3 days)
•	Budget alert — when spending crosses alertThreshold % of budget limit
•	Overdue bill alert — if a non-auto-pay bill passes its due date without being marked paid
•	Monthly summary email — optional, sent on 1st of month with prior month's spending summary

Add new EmailReminderLog entries for each finance reminder type following the existing pattern (entityType = "finance_bill" | "finance_budget" etc.).

8. CSV / Bank Statement Import
Many Australian banks (ANZ, CBA, NAB, Westpac) export CSV or OFX files. Provide a best-effort importer:

1.	User uploads CSV/OFX via /api/finance/transactions/import
2.	Parser detects column headers and maps: date, amount, description/narrative columns
3.	Show preview table: detected rows with auto-suggested category (based on payee-history and keyword matching)
4.	User can correct categories before confirming
5.	Duplicate detection: skip transactions within ±$0.01 of amount on same date with same payee
6.	Import confirmed → bulk-insert Transactions

Keyword-to-category mapping table (seeded defaults):
Keyword pattern	Suggested category
NETFLIX, STAN, DISNEY, SPOTIFY, APPLE, AMAZON PRIME	Streaming Services
COLES, WOOLWORTHS, ALDI, IGA, COSTCO	Groceries
SHELL, BP, CALTEX, 7-ELEVEN, AMPOL	Fuel
MCDONALD, KFC, SUBWAY, UBER EATS, DOORDASH, MENULOG	Dining Out
MEDICARE, CHEMIST, PHARMACY	Medical/Pharmacy
PAYROLL, SALARY, WAGE	Salary/Wages

9. Files & Folder Structure
All new files follow the existing project conventions. No new dependencies required — use what is already in package.json.

New directories and files to create:

Path	Description
src/app/(app)/finance/page.tsx	Finance Dashboard page (server component)
src/app/(app)/finance/bills/page.tsx	Bills & Expenses page
src/app/(app)/finance/recurring/page.tsx	Recurring Bills page
src/app/(app)/finance/budgets/page.tsx	Budgets page
src/app/(app)/finance/reports/page.tsx	Reports page
src/app/(app)/finance/accounts/page.tsx	Accounts page
src/app/(app)/finance/categories/page.tsx	Categories page
src/app/(app)/finance/layout.tsx	Finance section layout (sub-nav tabs)
src/components/finance/FinanceDashboard.tsx	Dashboard client component
src/components/finance/TransactionList.tsx	Transaction list with grouping
src/components/finance/QuickAddTransaction.tsx	Quick-add drawer/modal
src/components/finance/BudgetCard.tsx	Budget progress ring card
src/components/finance/BudgetForm.tsx	Add/edit budget form
src/components/finance/RecurringBillCard.tsx	Recurring bill card with pay button
src/components/finance/RecurringBillForm.tsx	Add/edit recurring bill form
src/components/finance/AccountCard.tsx	Account display card
src/components/finance/AccountForm.tsx	Add/edit account form
src/components/finance/CategoryGrid.tsx	Category manager with drag-to-reorder
src/components/finance/SavingsGoalCard.tsx	Savings goal progress bar card
src/components/finance/ReportSummary.tsx	Monthly summary chart (Recharts)
src/components/finance/ReportCategoryBreakdown.tsx	Donut chart + table
src/components/finance/ReportTrends.tsx	Multi-line spending trend chart
src/components/finance/ReportCashFlow.tsx	Cash flow bar chart
src/components/finance/CsvImporter.tsx	CSV import wizard
src/app/api/finance/accounts/route.ts	Accounts API (GET, POST)
src/app/api/finance/accounts/[id]/route.ts	Accounts API (PATCH, DELETE)
src/app/api/finance/categories/route.ts	Categories API
src/app/api/finance/categories/[id]/route.ts	Category by ID
src/app/api/finance/transactions/route.ts	Transactions list + create
src/app/api/finance/transactions/[id]/route.ts	Transaction by ID
src/app/api/finance/transactions/import/route.ts	CSV import endpoint
src/app/api/finance/recurring/route.ts	Recurring bills list + create
src/app/api/finance/recurring/[id]/route.ts	Recurring bill by ID
src/app/api/finance/recurring/[id]/pay/route.ts	Mark paid, advance due date
src/app/api/finance/budgets/route.ts	Budgets list + create
src/app/api/finance/budgets/[id]/route.ts	Budget by ID
src/app/api/finance/savings-goals/route.ts	Savings goals
src/app/api/finance/savings-goals/[id]/route.ts	Goal by ID
src/app/api/finance/reports/summary/route.ts	Monthly summary aggregate
src/app/api/finance/reports/trends/route.ts	Trend data
src/app/api/finance/reports/cashflow/route.ts	Cash flow data
src/app/api/finance/export/route.ts	CSV/XLSX export (uses existing xlsx package)
src/app/api/finance/dashboard/route.ts	Aggregated dashboard payload
src/lib/finance-seed.ts	Default category seeding function
src/lib/finance-cron.ts	Cron jobs: recurring bill creation, budget alerts, reminders

10. Files to Modify
File	Change
prisma/schema.prisma	Add FinanceAccount, FinanceCategory, Transaction, RecurringBill, Budget, SavingsGoal models; add finance relations to Family
src/components/layout/Sidebar.tsx	Add Finance nav item with Wallet icon after Chores
src/components/layout/QuickAdd.tsx	Add finance quick-add option ("$ Expense", "$ Income") to the command palette
src/lib/cron.ts (or equivalent)	Register finance cron jobs from finance-cron.ts
docker/docker-entrypoint.sh (or similar)	Ensure prisma migrate deploy runs for new schema additions
docker-compose.yml	No changes expected; finance uses same DB
src/app/(app)/home/page.tsx	Optionally add a finance summary widget to the home dashboard (upcoming bills this week, budget health)

11. Recommended Build Order
Build in phases to allow incremental testing and avoid regressions:

Phase 1 — Foundation
7.	Add Prisma schema models and run migration
8.	Seed default categories (finance-seed.ts) — call on family creation
9.	Accounts API + AccountForm + AccountCard
10.	Categories API + CategoryGrid
11.	Add Finance to Sidebar

Phase 2 — Core Transactions
12.	Transactions API (list, create, update, delete) with full filter support
13.	TransactionList component with date grouping
14.	QuickAddTransaction drawer (fast path — amount, type, category, payee, date)
15.	Bills & Expenses page wired up end-to-end
16.	Global ⌘K integration

Phase 3 — Recurring Bills
17.	RecurringBill API (list, create, update, delete, pay)
18.	RecurringBillCard + RecurringBillForm
19.	Recurring page
20.	Cron job to auto-create transaction instances when bill comes due
21.	Email reminders

Phase 4 — Budgets
22.	Budget API (list with spent totals, create, update, delete)
23.	BudgetCard with ring chart
24.	Budgets page with period navigation
25.	Auto-rollover cron logic
26.	Budget alert emails

Phase 5 — Reports & Dashboard
27.	Dashboard API aggregation endpoint
28.	Finance Dashboard page
29.	Reports page — Summary, Category Breakdown, Trends, Cash Flow
30.	CSV/XLSX export

Phase 6 — Polish
31.	CSV bank import wizard
32.	Savings Goals
33.	Home page finance widget
34.	Monthly summary email
35.	Print-friendly report styles

12. UX & Design Notes
Follow the existing Homebase design system precisely:
•	Use only Tailwind CSS utility classes already in use — no new CSS libraries
•	Use shadcn/ui components (already installed) for dialogs, dropdowns, and form elements
•	Use Sonner (already installed) for toast notifications
•	Lucide-react icons (already installed) for all iconography
•	Respect the user's theme (light/dark) — all colour references use CSS variables (var(--background), var(--foreground), etc.)
•	Amount inputs: use locale-aware number formatting; always show 2 decimal places
•	Currency: default AUD; use the family's currency setting if one is added, otherwise hardcode AUD as the display symbol but store as plain Float
•	Empty states must be helpful — show a relevant illustration or icon, a clear heading, and a CTA button (e.g. "Add your first account")
•	Loading states must use skeleton screens consistent with other pages
•	Error states must use toast (sonner) + inline error message where appropriate
•	Mobile: the quick-add button floats bottom-right on /finance/* routes, in addition to the global FAB
•	Accessibility: all interactive elements must have aria-label, form inputs must have visible labels, colour-only information must have a text alternative

13. Security Considerations
•	All API routes must check session.user.familyId and only return/modify records belonging to that family
•	Private transactions (isPrivate=true) must only be readable by the createdBy user
•	Receipt file uploads follow the same pattern as Document uploads — store in the uploads directory, serve via the existing file-serving mechanism, restrict to family members
•	Amount values must be validated server-side as positive finite numbers
•	CSV import must sanitise all input fields before DB insertion
•	AuditLog entries for all finance mutations (matching existing entity patterns)

14. Testing Checklist
Before marking each phase complete, verify:

•	API: all routes return correct data for valid requests
•	API: all routes return 401 for unauthenticated requests
•	API: cross-family data isolation — cannot read another family's data
•	UI: quick-add saves correctly and appears in transaction list immediately
•	UI: budget ring updates in real-time after adding a transaction in that category
•	UI: recurring bill "Mark as paid" creates a Transaction and advances nextDueDate
•	UI: CSV export contains all transactions in the filtered period
•	UI: all pages render correctly in light and dark mode
•	UI: all pages render correctly on mobile (375px) and desktop (1280px)
•	Cron: recurring bill instances are created on or before their due date
•	Cron: budget alert email is sent once per threshold crossing, not on every request
•	No console errors or TypeScript errors in the final build

15. Docker & Deployment Notes
Homebase is built on Windows and deployed to a Synology NAS via Docker. The following deployment steps apply:

36.	Update docker-entrypoint.sh (or the existing entrypoint script) to run prisma migrate deploy after adding the new schema models — this applies migrations to the production SQLite DB on container start
37.	No new environment variables are required for the finance module
38.	The finance-seed.ts function should be called during the entrypoint seed step — check if default categories already exist before inserting (idempotent)
39.	No new Docker volumes or ports are needed
40.	After building, copy updated docker-compose.yml, Dockerfile, and entrypoint script to the NAS before restarting the container

💡 Because SQLite is used, the migration runs fast and does not require a separate DB container. All finance data lives in the same homebase.db file that is already volume-mounted.

Appendix: Default Category List
These are seeded into FinanceCategory when a new family is created (or when first Finance page is loaded for an existing family with no finance categories).

Category	Type	Icon (lucide)	Colour
Housing / Rent	expense	home	#6366F1
Mortgage	expense	building	#6366F1
Electricity	expense	zap	#EAB308
Gas	expense	flame	#F97316
Water	expense	droplets	#3B82F6
Internet	expense	wifi	#8B5CF6
Mobile Phone	expense	smartphone	#8B5CF6
Groceries	expense	shopping-cart	#22C55E
Dining Out	expense	utensils	#F59E0B
Coffee & Café	expense	coffee	#92400E
Car Loan	expense	car	#64748B
Fuel	expense	fuel	#EF4444
Car Insurance	expense	shield	#64748B
Registration	expense	file-text	#64748B
Parking	expense	parking-circle	#64748B
Public Transport	expense	bus	#0EA5E9
Health Insurance	expense	heart-pulse	#EC4899
Medical / Dental	expense	stethoscope	#EC4899
Pharmacy	expense	pill	#EC4899
Childcare	expense	baby	#F472B6
School Fees	expense	graduation-cap	#F472B6
Clothing	expense	shirt	#A78BFA
Personal Care	expense	sparkles	#A78BFA
Streaming Services	expense	tv	#1D4ED8
Other Subscriptions	expense	repeat	#1D4ED8
Entertainment	expense	clapperboard	#7C3AED
Holidays / Travel	expense	plane	#0891B2
Gym & Fitness	expense	dumbbell	#059669
Pet Care	expense	paw-print	#B45309
Gifts	expense	gift	#DB2777
Charity	expense	hand-heart	#DB2777
Household Supplies	expense	package	#78716C
Home Maintenance	expense	wrench	#78716C
Home Insurance	expense	shield-check	#78716C
Savings Transfer	expense	piggy-bank	#10B981
Other Expense	expense	circle-dot	#6B7280
Salary / Wages	income	briefcase	#10B981
Freelance	income	laptop	#10B981
Investment Return	income	trending-up	#10B981
Tax Return	income	receipt	#10B981
Other Income	income	plus-circle	#10B981


End of Specification
Homebase Finance Module v1.0  •  May 2026
