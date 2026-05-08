🏠 Homebase
Finance Module
Multi-Member, Multi-Location & External Entity Extension
Design Guidance & Implementation Plan   v2.0  |  May 2026
 
1.  What Problem Are We Solving?
The v1.0 Finance Module was designed for a single household with a flat category list. Three new requirements push beyond that model:

•	Per-person cost ownership — Mark and Michelle both have a car registration, but each must be tracked, reported, and budgeted independently.
•	Multi-location rates — Address A and Address B have separate utility accounts (council rates, electricity tariffs, etc.) that must not be blended.
•	External entity allocation — Some costs belong to entities such as a superannuation fund that are separate legal or accounting structures from the household.

These three needs share the same root solution: a richer ownership & assignment model layered on top of the existing transaction schema.

2.  Core Design Concepts
2.1  Master Categories with Sub-Categories
The v1 schema already included a parentId self-reference on FinanceCategory. The extension activates this field and makes it first-class in the UI. The result is a two-level hierarchy:

Level	Example	Purpose
Master Category	Vehicle	Logical grouping for reporting roll-ups
Sub-Category	Vehicle > Mark – Mazda	Cost centre for a specific owner/vehicle
Sub-Category	Vehicle > Michelle – Hyundai	Cost centre for a separate owner/vehicle
Master Category	Rates & Utilities	Grouping for location-based costs
Sub-Category	Rates & Utilities > Address A	All rates/utilities for Property A
Sub-Category	Rates & Utilities > Address B	All rates/utilities for Property B
Master Category	Superannuation Fund	External entity — separate cost structure
Sub-Category	Superannuation > Contributions	Regular contributions
Sub-Category	Superannuation > Admin Fees	Fund administration charges

💡 Existing flat categories (e.g. 'Registration', 'Electricity') are promoted to Master Categories automatically on migration. Users then create sub-categories beneath them.

2.2  Members
A FamilyMember record already exists (or can be derived from the User model). Transactions and recurring bills gain an optional memberId field so each line item can be attributed to a specific person — or left as a household expense.

•	Mark pays his own registration — Transaction.memberId = mark.id
•	Michelle pays her own registration — Transaction.memberId = michelle.id
•	Mortgage — Transaction.memberId = null (shared household expense)

2.3  Locations
A lightweight Location model (or simple enum on the transaction) allows Address A costs and Address B costs to be separated without duplicating every category.

•	Option A (recommended): Add a Location model and a locationId FK on Transaction.
•	Option B: Add a simple text locationTag field on Transaction (faster to build, less structured).

💡 Option A is recommended because it enables clean filtering, reporting, and future expansion (e.g. a rental property or business premises).

2.4  External Entities
A superannuation fund, a business, a trust, or an investment structure is an entity that sits outside the household but receives money from it. Model this as a special account type with entity classification:

•	Add a new FinanceAccount.accountType value: entity
•	Mark the account with an entityType field: superannuation | trust | business | investment | other
•	Transactions assigned to this account (via accountId) are automatically separated in reports

This lets you run reports that show: 'Here is total household spending; here is how much went to the superannuation fund; here is how much went to Address B rates.'

3.  Database Schema Changes
All changes are additive (no breaking changes to existing tables). Run a single Prisma migration after applying these additions.

3.1  FinanceCategory  — activate hierarchy
Field	Type	Change	Notes
parentId	String?	EXISTING — activate	Self-ref FK for master/sub hierarchy. Already in schema.
level	Int	NEW — add	0 = master, 1 = sub. Computed and stored for query performance.
isPersonal	Boolean	NEW — add	True = category is person-specific (show member selector on transaction).
isLocationBased	Boolean	NEW — add	True = category is location-specific (show location selector on transaction).
isExternal	Boolean	NEW — add	True = category belongs to an external entity account.

3.2  Transaction  — add assignment fields
Field	Type	Change	Notes
memberId	String?	NEW — add	FK → FamilyMember. Null = household/shared expense.
locationId	String?	NEW — add	FK → Location. Null = not location-specific.

3.3  RecurringBill  — add assignment fields
Field	Type	Change	Notes
memberId	String?	NEW — add	Inherited by auto-created Transaction instances.
locationId	String?	NEW — add	Inherited by auto-created Transaction instances.

3.4  New: Location Model
Field	Type	Notes
id	String (cuid)	Primary key
familyId	String	FK → Family
name	String	e.g. 'Address A – 12 Oak St', 'Address B – 45 Elm Ave'
address	String?	Full street address
type	String	primary | investment | business | other
isActive	Boolean	Default true
color	String?	Display colour hex for UI chips
icon	String?	lucide icon name
sortOrder	Int	Display order
createdAt	DateTime	Auto

3.5  FinanceAccount  — add entity classification
Field	Type	Change	Notes
accountType	String	EXTEND — new values	Add: entity  (alongside existing checking, savings, etc.)
entityType	String?	NEW — add	superannuation | trust | business | investment | other. Only used when accountType = entity.
entityABN	String?	NEW — add	Optional Australian Business Number for superannuation/businesses.

4.  UI / UX Changes Required
4.1  Categories Page — Two-Level Manager
Replace the current flat category grid with a hierarchical tree view:

•	Master categories shown as collapsible rows with expand/collapse toggle
•	Sub-categories nested beneath, shown with an indent and a coloured left border
•	'Add sub-category' button on each master category row
•	Drag-to-reorder within each level (not across levels — sub-categories cannot be promoted)
•	isPersonal, isLocationBased toggles on sub-category edit form

💡 The master category carries the icon and colour used in reports. Sub-categories inherit the icon/colour by default but can override.

4.2  Quick-Add Transaction Drawer — Context Selectors
When a category is selected that has isPersonal = true, show a 'For whom?' selector:

•	Member chip group (Mark | Michelle | Shared) — defaults to Shared
•	Pre-select the last used member for this category

When a category has isLocationBased = true, show a 'Which property?' selector:

•	Location chip group (Address A | Address B) — required field, no default

When the selected account has accountType = 'entity', show an informational badge: 'This cost is assigned to [Entity Name]'

💡 If a user selects a master category instead of a sub-category, prompt them to pick the sub-category first. The member/location selectors only appear on sub-categories.

4.3  Recurring Bills — Assignment Inheritance
Add member and location selectors to the Add/Edit Recurring Bill form. These values are automatically copied to every Transaction instance created by the recurring bill. Individual instances can be overridden after the fact.

4.4  Budgets — Sub-Category Budgets
Allow budgets to be set at the sub-category level (not just master category):

•	Budget form category picker now shows the full two-level hierarchy
•	A budget set on 'Vehicle > Mark – Mazda' only counts Mark's transactions
•	A budget set on 'Vehicle' (master) counts ALL sub-category transactions combined
•	Budget ring cards on the Dashboard group sub-category budgets under their master

4.5  Reports — Dimension Filters
Add filter controls to every Report tab:

•	Member filter — All Members | Mark | Michelle | Shared (multi-select)
•	Location filter — All Locations | Address A | Address B (multi-select)
•	Entity filter — Household Only | Include Entities | [specific entity name]

Category Breakdown donut chart should have a toggle: 'Show master categories' vs 'Show sub-categories'. The master view provides a clean top-level summary; the sub-category view gives the full detail.

4.6  New: Locations Page (/finance/locations)
A simple management page for locations:

•	List of location cards (name, address, type badge, colour swatch)
•	Add/edit location form: name, address, type, colour, icon
•	Each card links to /finance/bills filtered to that location
•	'Costs this month' summary figure on each card

💡 Add 'Locations' to the Finance sub-nav between 'Accounts' and 'Categories'.

4.7  New: External Entities in Accounts
When creating or editing a FinanceAccount, add a toggle: 'This is an external entity (superannuation, trust, business, etc.).' When toggled on:

•	Entity type selector appears: Superannuation Fund | Trust | Business | Investment Fund | Other
•	Optional ABN field appears
•	Account card in /finance/accounts renders with a distinct 'External Entity' badge
•	Transactions assigned to this account appear in a separate 'External' section in the Bills list

5.  API Changes
5.1  New Routes
Method	Route	Description
GET	/api/finance/locations	List all locations for family
POST	/api/finance/locations	Create location
PATCH	/api/finance/locations/[id]	Update location
DELETE	/api/finance/locations/[id]	Delete location (reassign or orphan transactions first)
GET	/api/finance/members	List family members for assignment (can proxy Family.members)

5.2  Modified Routes
Route	Change
GET /api/finance/transactions	Add filter params: memberId, locationId, entityAccountId, hierarchyMode (flat|master|sub)
POST /api/finance/transactions	Accept memberId, locationId in request body
PATCH /api/finance/transactions/[id]	Accept memberId, locationId
GET /api/finance/categories	Add includeHierarchy=true param that returns parent/child structure; add level param to filter by level
POST /api/finance/categories	Accept parentId, isPersonal, isLocationBased, isExternal
GET /api/finance/budgets	Add memberId, locationId params for filtered budget spend calculation
GET /api/finance/reports/summary	Accept memberId[], locationId[], entityMode (include|exclude|only)
GET /api/finance/reports/category	Accept hierarchyMode (master|sub) param
GET /api/finance/dashboard	Include per-member upcoming bills summary

6.  Seeding: Default Hierarchy for New Families
Update finance-seed.ts to create the following master/sub structure as defaults. Existing families will need a one-time migration script (see Section 7).

Suggested Default Master → Sub Structure
Master Category	Default Sub-Categories Created	isPersonal	isLocBased
Vehicle	(none — user adds per person)	—	—
Rates & Utilities	(none — user adds per location)	—	—
Housing / Rent	Housing / Rent (flat — no sub required)	No	Yes
Mortgage	Mortgage (flat)	No	Yes
Mobile Phone	(none — user adds per person)	—	—
Health Insurance	(none — user adds per person)	—	—
All other v1 categories	Promoted as master; no sub-categories created	No	No

💡 At first Finance page load, if a family has zero locations, prompt them to add at least one before saving any location-based transactions.

7.  Migration for Existing Families
Because this is an additive schema change, existing data is not lost. However, existing transactions will not have memberId or locationId set, which is fine — they display as 'Shared / No Location'. The following migration steps are recommended:

7.1  Prisma Migration
•	Add new fields with nullable/default values so existing rows are not affected
•	Run: npx prisma migrate dev --name finance_multi_entity
•	The migration should be backwards-compatible — existing transactions simply have null for new fields

7.2  Data Migration Script (Optional — Run Once)
If you want to retroactively assign memberId/locationId to historical transactions, write a one-off script:

•	src/scripts/migrate-finance-assignments.ts
•	Match payee keywords to known members (e.g. 'MARK REGO' → mark.id)
•	Match category names to locations (e.g. existing 'Rates' transactions → Address A by default)
•	Run dry-run first: node scripts/migrate-finance-assignments.ts --dry-run
•	Review output, then commit with: node scripts/migrate-finance-assignments.ts --commit

⚠️  Do not auto-migrate without reviewing the dry-run output. Incorrect assignments will skew historical reports.

8.  Implementation Plan
Build in six focused phases on top of the existing v1 build order. Each phase delivers testable, independently useful functionality.

Phase	Work Items	Effort Est.
Phase 1 Foundation	Prisma schema additions (memberId, locationId on Transaction & RecurringBill; level, isPersonal, isLocationBased, isExternal on FinanceCategory; Location model; entity fields on FinanceAccount). Migration. Update seed function.	2–3 days
Phase 2 Category Hierarchy	Two-level CategoryGrid UI. Add sub-category form. Update /api/finance/categories to return hierarchy. Update Quick-Add category picker to show master/sub tree.	2–3 days
Phase 3 Member & Location Assignment	Locations page + API. Member selector in Quick-Add and full transaction form. Location selector in Quick-Add. Member/location fields on RecurringBill form. Filters on Bills list.	3–4 days
Phase 4 External Entities	Entity toggle + type/ABN fields on Account form. External badge in Accounts list. Separate 'External' section in Bills list. Entity filter on Reports.	1–2 days
Phase 5 Reports & Budgets	Member/location filter controls on all Report tabs. Hierarchy toggle (master vs sub) on Category Breakdown. Sub-category budgets in Budget form. Per-member budget cards.	2–3 days
Phase 6 Polish & Data Migration	One-off migration script (optional). Empty state UX for zero-member / zero-location scenarios. Onboarding prompts (add your first member, add your first location). Testing checklist.	1–2 days

Total estimated effort: 11–17 developer days depending on complexity of existing codebase integration.

9.  New Files & Modified Files
New Files
Path	Description
src/app/(app)/finance/locations/page.tsx	Locations management page
src/components/finance/LocationCard.tsx	Location display card with monthly cost
src/components/finance/LocationForm.tsx	Add/edit location dialog
src/components/finance/MemberSelector.tsx	Chip group for member assignment (Shared | Mark | Michelle)
src/components/finance/LocationSelector.tsx	Chip group for location assignment
src/components/finance/CategoryTree.tsx	Two-level category manager replacing CategoryGrid
src/app/api/finance/locations/route.ts	Locations API (GET, POST)
src/app/api/finance/locations/[id]/route.ts	Location by ID (PATCH, DELETE)
src/app/api/finance/members/route.ts	Family members list for assignment UI
src/scripts/migrate-finance-assignments.ts	One-off data migration script

Modified Files
Path	Change Required
prisma/schema.prisma	Add Location model; add memberId, locationId to Transaction & RecurringBill; add level, isPersonal, isLocationBased, isExternal to FinanceCategory; add entityType, entityABN to FinanceAccount
src/lib/finance-seed.ts	Set level=0 on all seeded categories; add Location seeding prompt logic
src/components/finance/QuickAddTransaction.tsx	Add member selector (conditional), location selector (conditional), and entity badge
src/components/finance/TransactionList.tsx	Show member chip and location chip on each row; add 'External' section grouping
src/components/finance/RecurringBillForm.tsx	Add member and location selectors
src/components/finance/AccountForm.tsx	Add entity toggle, entityType dropdown, ABN field
src/components/finance/AccountCard.tsx	Show 'External Entity' badge when accountType = entity
src/components/finance/BudgetForm.tsx	Use CategoryTree picker instead of flat list; allow sub-category budget
src/components/finance/BudgetCard.tsx	Show member name on member-specific budget cards
src/components/finance/ReportSummary.tsx	Add member/location filter controls
src/components/finance/ReportCategoryBreakdown.tsx	Add hierarchy toggle (master vs sub view)
src/components/finance/ReportTrends.tsx	Add member/location filters
src/app/api/finance/transactions/route.ts	Add memberId, locationId to filter params and create payload
src/app/api/finance/categories/route.ts	Add hierarchy response mode; accept new boolean fields
src/app/api/finance/budgets/route.ts	Filter spent total by memberId, locationId when set
src/app/api/finance/reports/summary/route.ts	Accept memberId[], locationId[], entityMode params
src/app/api/finance/dashboard/route.ts	Add per-member upcoming bills to payload
src/app/(app)/finance/layout.tsx	Add 'Locations' tab to sub-nav

10.  Extended Testing Checklist
In addition to the v1 testing checklist, verify the following for the new functionality:

Category Hierarchy
•	Master category cannot be assigned directly to a transaction (must pick sub-category if subs exist)
•	Sub-category rolls up to master in summary reports
•	Deleting a master category with sub-categories prompts the user to reassign subs first
•	Budget set on master category correctly sums all sub-category transactions

Member Assignment
•	Transaction saved with memberId = mark.id shows 'Mark' chip in the Bills list
•	Reports filtered to 'Michelle' exclude Mark's transactions and shared transactions
•	Reports filtered to 'Shared' only show transactions with memberId = null
•	Recurring bill with memberId = mark.id creates Transaction instances with mark.id
•	Member budget: spending over limit only triggers alert when Mark's transactions cause the breach, not Michelle's

Location Assignment
•	Transaction saved with locationId shows location chip in Bills list
•	Address A filter on reports excludes Address B and unassigned transactions
•	Locations page shows correct 'Costs this month' figure per location
•	Recurring bill with locationId correctly inherits on auto-created transactions

External Entities
•	Account with accountType = entity appears under a separate 'External' header in Accounts page
•	Transactions assigned to entity account appear in a separate section in Bills list
•	Reports with entityMode = 'exclude' do not count superannuation contributions in household spending total
•	Reports with entityMode = 'only' show only entity-assigned costs
•	CSV export respects entity filter

11.  Open Questions / Decisions Needed
#	Question	Options	Recommendation
1	How deep should the category hierarchy go?	2 levels (master + sub) vs unlimited nesting	Cap at 2 levels. Unlimited nesting adds UI and query complexity with minimal benefit for a household app.
2	Should locations be mandatory on location-based categories?	Required field vs optional with warning	Required field with a clear error state. Prevents data entry that silently falls into 'unassigned'.
3	Can a transaction have both a memberId and a locationId?	Yes always / Yes but warn / Mutually exclusive	Yes always. Mark's car registration at Address A is valid. These are independent dimensions.
4	How to handle existing transactions after hierarchy migration?	Leave as unassigned / Prompt user to assign / Auto-assign by keyword	Leave as unassigned. Show a one-time banner: 'You have X uncategorised transactions. Assign them now?'
5	Should superannuation contributions appear in the household budget summary?	Always excluded / Always included / User toggle	User toggle via entityMode filter. Default = exclude for household budgets, include for net worth view.

Appendix: Example Data Model After Extension
To illustrate what the data looks like for the three new use cases:

A: Mark's Car Registration vs Michelle's Car Registration
Field	Mark's Rego	Michelle's Rego
category.name	Vehicle > Mark – Mazda 3	Vehicle > Michelle – Hyundai i30
category.parentId	→ Vehicle (master)	→ Vehicle (master)
category.isPersonal	true	true
memberId	→ mark.id	→ michelle.id
amount	850.00	720.00
payee	VicRoads	VicRoads

B: Address A Rates vs Address B Rates
Field	Address A Rates	Address B Rates
category.name	Rates > Address A	Rates > Address B
category.isLocationBased	true	true
locationId	→ addressA.id	→ addressB.id
accountId	→ Primary Checking	→ Investment Account
amount	1200.00	980.00

C: Superannuation Fund Allocation
Field	Contribution	Admin Fee
account.name	XYZ Super Fund	XYZ Super Fund
account.accountType	entity	entity
account.entityType	superannuation	superannuation
category.name	Superannuation > Contribution	Superannuation > Admin Fee
category.isExternal	true	true
amount	500.00 / month	12.50 / month

Homebase Finance Module — Multi-Entity Extension  |  v2.0  |  May 2026
