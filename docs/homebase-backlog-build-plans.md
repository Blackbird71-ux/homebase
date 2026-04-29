# HomeBase — Backlog Feature Build Plans
**Generated:** April 2026  
**Companion to:** `homebase-feature-suggestions-and-plans.md`  
**Status:** Planning document — features not yet prioritised

---

## Table of Contents

1. [Quick-add Command Palette](#1-quick-add-command-palette)
2. [Meal Plan Templates](#2-meal-plan-templates)
3. [Recipe Scaling](#3-recipe-scaling)
4. [Shopping List Price Estimates](#4-shopping-list-price-estimates)
5. [Chore / Task Roster](#5-chore--task-roster)
6. [Household Contacts](#6-household-contacts)
7. [Document Vault](#7-document-vault)
8. [Budgeting Module](#8-budgeting-module)
9. [Push Notifications](#9-push-notifications)
10. [Family Activity Log](#10-family-activity-log)
11. [Automated DB Backups](#11-automated-db-backups)
12. [Offline PWA — Background Sync](#12-offline-pwa--background-sync)
13. [Weekly Family Summary](#13-weekly-family-summary)

---

## 1. Quick-add Command Palette

**Goal:** Let any family member add an event, list item, note, or meal plan entry from anywhere in the app using a keyboard shortcut (Cmd+K / Ctrl+K) or a floating action button — without navigating away from their current page.

**Effort:** Medium  
**Dependencies:** None

### Scope

1. **Trigger** — keyboard shortcut `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) and a floating `+` button (bottom-right, above mobile nav).
2. **Palette UI** — modal with a search/type input and quick-action tiles: Add Event, Add List Item, Add Note, Plan a Meal.
3. **Inline mini-forms** — selecting an action expands a compact form inside the palette (not a full modal navigation).
4. **Result** — on save, item is created and a toast confirms. Palette closes. User stays on their current page.

### Schema changes

None.

### Files to create / modify

| File | Change |
|---|---|
| `src/components/layout/QuickAdd.tsx` | New — palette modal with search input and action tiles |
| `src/components/layout/QuickAddFAB.tsx` | New — floating action button (mobile + desktop) |
| `src/app/(app)/layout.tsx` | Mount `<QuickAdd>` and `<QuickAddFAB>` at root; add keyboard listener |
| `src/components/layout/QuickAddEventForm.tsx` | New — compact event creation form |
| `src/components/layout/QuickAddListItemForm.tsx` | New — compact list item form with list selector |
| `src/components/layout/QuickAddNoteForm.tsx` | New — compact note form |
| `src/lib/quick-add-context.tsx` | New — context to open palette from any component |

### Implementation notes

- Use the existing shadcn `Dialog` / `Command` components — `cmdk` is already a shadcn dependency.
- The keyboard listener goes on `document` in a `useEffect` in the root layout client component.
- Each mini-form reuses existing API routes (`POST /api/events`, `POST /api/lists/[id]/items`, `POST /api/notes`) — no new endpoints.
- For list item: include a list selector dropdown defaulting to the user's starred shopping list (`dashboardShoppingListId` from `uiPreferences`).
- FAB: `position: fixed; bottom: 5rem; right: 1.5rem` — sits above the mobile bottom nav (`bottom: 4rem` approx).
- Keep forms minimal — only required fields. Users can open the full form later to add detail.

### Docker / NAS impact

No schema changes. Standard redeploy.

### Acceptance criteria

- [ ] `Cmd+K` / `Ctrl+K` opens the palette from any page
- [ ] FAB button opens the palette on click
- [ ] Each action type shows a compact form inside the palette
- [ ] Items are created successfully and a toast is shown
- [ ] Palette closes after save and user remains on their current page
- [ ] No regressions to existing full-form flows

---

## 2. Meal Plan Templates

**Goal:** Save a week's meal plan as a named template and re-apply it to any future week — reducing the effort of repetitive meal planning for families who rotate through a set of regular weekly plans.

**Effort:** Medium  
**Dependencies:** None

### Scope

1. **Save current week as template** — button in the meal planner toolbar to save the currently displayed week as a named template.
2. **Apply template** — button to pick a saved template and fill the current week's empty slots (with an option to overwrite existing).
3. **Manage templates** — list of saved templates in Settings → Meal Planning; rename and delete.
4. **Template contents** — stores meal type + recipe assignments for each day-of-week (Mon–Sun), not specific dates.

### Schema changes

```prisma
model MealPlanTemplate {
  id        String                  @id @default(cuid())
  name      String
  familyId  String
  family    Family                  @relation(fields: [familyId], references: [id])
  slots     MealPlanTemplateSlot[]
  createdAt DateTime                @default(now())

  @@unique([familyId, name])
}

model MealPlanTemplateSlot {
  id         String           @id @default(cuid())
  templateId String
  template   MealPlanTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  dayOfWeek  Int              // 0 = Monday … 6 = Sunday
  mealType   String           // breakfast | lunch | dinner | snacks
  recipeId   String?
  recipe     Recipe?          @relation(fields: [recipeId], references: [id], onDelete: SetNull)
  note       String?
  createdAt  DateTime         @default(now())

  @@unique([templateId, dayOfWeek, mealType])
}
```

Add `mealPlanTemplates MealPlanTemplate[]` to the `Family` model and `templateSlots MealPlanTemplateSlot[]` to `Recipe`.

### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `MealPlanTemplate` and `MealPlanTemplateSlot` models |
| `prisma/migrations/*/migration.sql` | New migration |
| `src/app/api/meal-plan/templates/route.ts` | New — GET (list), POST (create/save) |
| `src/app/api/meal-plan/templates/[id]/route.ts` | New — GET, PATCH (rename), DELETE |
| `src/app/api/meal-plan/templates/[id]/apply/route.ts` | New — POST (apply template to a week) |
| `src/components/meal-plan/TemplateToolbar.tsx` | New — Save as Template + Apply Template buttons |
| `src/components/meal-plan/ApplyTemplateModal.tsx` | New — template picker with overwrite option |
| `src/app/(app)/meal-plan/page.tsx` | Add `<TemplateToolbar>` to meal planner |
| `src/app/(app)/settings/meal-planning/page.tsx` | New — template management page |
| `src/app/(app)/settings/page.tsx` | Add "Meal Planning" tab |

### Implementation notes

- "Save as template" reads the current week's `MealPlan` records and maps them to day-of-week slots (0 = Monday relative to the week start).
- "Apply template" takes the template's slots and creates `MealPlan` records for the target week, skipping slots that are empty (`recipeId` and `note` both null). Overwrite mode deletes existing records first.
- Day-of-week mapping: use `date-fns` `getDay()` relative to the family's `weekStartsOn` setting.
- Template names should be unique per family — enforce at DB level (`@@unique([familyId, name])`) and show a friendly error in the UI.

### Docker / NAS impact

Schema migration required. **Copy updated files and run `docker-compose down && docker-compose up -d --build` on NAS.**

### Acceptance criteria

- [ ] "Save as template" captures the current week's full meal plan
- [ ] Saved templates appear in the Apply modal and Settings page
- [ ] Applying a template fills the target week correctly
- [ ] Overwrite mode replaces existing meals; default mode skips filled slots
- [ ] Templates can be renamed and deleted from Settings
- [ ] Deleting a recipe does not delete templates that referenced it (slot `recipeId` set to null)

---

## 3. Recipe Scaling

**Goal:** Allow a user to adjust the serving count on a recipe detail page and have all ingredient quantities scale proportionally — useful when cooking for a larger group or halving a recipe.

**Effort:** Low–Medium  
**Dependencies:** None (no schema changes)

### Scope

1. **Serving size control** — a `+` / `−` stepper next to the servings count on the recipe detail page.
2. **Scaled ingredients** — ingredient quantities update in real time as the serving count changes.
3. **Visual indicator** — a small "scaled" badge when the displayed serving count differs from the original.
4. **Reset** — a reset button to return to the original quantities.
5. **No persistence** — scaling is a view-only UI state; the underlying recipe is unchanged.

### Schema changes

None. The recipe `servings` field and `ingredients` JSON are sufficient.

### Files to modify

| File | Change |
|---|---|
| `src/app/(app)/recipes/[id]/RecipeDetail.tsx` | Add serving stepper; pass scale factor to ingredient list |
| `src/components/recipes/IngredientList.tsx` | New (or modify existing) — render scaled quantities |
| `src/lib/recipe-scaling.ts` | New — ingredient quantity parser and scaler utility |

### Implementation notes

The main complexity is parsing ingredient quantity strings from the scraped/entered data. Implement a `parseQuantity(str: string): { amount: number | null, unit: string, name: string }` function that handles common formats:

- `"2 cups flour"` → `{ amount: 2, unit: 'cups', name: 'flour' }`
- `"1/2 tsp salt"` → `{ amount: 0.5, unit: 'tsp', name: 'salt' }`
- `"3 large eggs"` → `{ amount: 3, unit: '', name: 'large eggs' }`
- `"Salt to taste"` → `{ amount: null, unit: '', name: 'Salt to taste' }` (no scaling)

Scaling logic:

```ts
export function scaleIngredient(ingredient: string, scaleFactor: number): string {
  const parsed = parseQuantity(ingredient)
  if (!parsed.amount) return ingredient  // can't scale — return as-is
  const scaled = parsed.amount * scaleFactor
  const display = formatAmount(scaled)  // convert 1.5 → "1½", 0.25 → "¼" etc.
  return `${display} ${parsed.unit} ${parsed.name}`.trim()
}
```

- Use vulgar fraction display (`½`, `¼`, `¾`, `⅓`, `⅔`) for common values — more readable than decimals.
- Ingredients that can't be parsed (no leading number) are displayed unchanged.
- Scale factor = `currentServings / originalServings`. Store `currentServings` in React state initialised from `recipe.servings`.

### Docker / NAS impact

No schema changes. Standard redeploy.

### Acceptance criteria

- [ ] Serving stepper appears on recipe detail page when `servings` is set
- [ ] Ingredient quantities update in real time when servings change
- [ ] Fractions display as vulgar fractions (½, ¼ etc.)
- [ ] Ingredients without a parseable quantity display unchanged
- [ ] "Scaled" badge appears when not at original serving count
- [ ] Reset button returns to original quantities
- [ ] Underlying recipe data is not modified

---

## 4. Shopping List Price Estimates

**Goal:** Let families enter an estimated unit price for shopping list items so they can see a running total before heading to the store — reducing checkout surprises.

**Effort:** Low (list side) + Medium (budget summary view)  
**Dependencies:** Complements the Budgeting Module if built later

### Scope

1. **Price field on ListItem** — optional unit price and quantity fields.
2. **Line total** — each item shows `qty × price` inline.
3. **List total** — running total of uncompleted items shown at the top/bottom of the list.
4. **Category subtotals** — total per category group.
5. **Price entry UX** — inline edit on the item row (not a separate modal).

### Schema changes

```prisma
// Add to ListItem model
unitPrice  Float?   // optional — e.g. 3.50
quantity   Float?   @default(1)
unit       String?  // e.g. "kg", "pack", "each"
```

Migration filename suggestion: `add_list_item_pricing`

### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `unitPrice`, `quantity`, `unit` to `ListItem` |
| `prisma/migrations/*/migration.sql` | New migration |
| `src/components/lists/ListItemRow.tsx` | Add inline price/qty fields; show line total |
| `src/components/lists/CategoryGroup.tsx` | Show category subtotal |
| `src/components/lists/ShoppingList.tsx` | Show grand total for uncompleted items |
| `src/app/api/lists/[id]/items/[itemId]/route.ts` | Accept `unitPrice`, `quantity`, `unit` in PATCH |
| `src/types/index.ts` | Extend `ListItem` type |

### Implementation notes

- Price fields are shown on hover/focus of an item row — same pattern as the existing lock button.
- Grand total only sums items where `isCompleted === false` — so ticking items off reduces the total in real time.
- Format as AUD by default (family is AU-based) — use `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`. Make currency configurable via a family setting later if needed.
- Items with no price set contribute `$0` to the total (not shown as a line amount).
- The total area at the bottom of the list: `"Estimated total: $47.20 (12 items remaining)"`.

### Docker / NAS impact

Schema migration required. **Copy updated files and run `docker-compose down && docker-compose up -d --build` on NAS.**

### Acceptance criteria

- [ ] Unit price and quantity fields are available on each shopping list item
- [ ] Line total (qty × price) shows on items with a price set
- [ ] Running grand total shows at the bottom of the list
- [ ] Completing an item removes it from the total
- [ ] Category subtotals show per group
- [ ] Items with no price are excluded from totals without error
- [ ] Existing list items are unaffected (fields default to null/1)

---

## 5. Chore / Task Roster

**Goal:** Give families a dedicated place to manage recurring household chores assigned to specific family members — distinct from shopping lists and to-do lists, with automatic rotation and a completion history.

**Effort:** Medium  
**Dependencies:** None

### Scope

1. **Chore model** — name, assigned user(s), recurrence schedule, optional rotation.
2. **Roster view** — a new "Chores" page showing each chore, its assignee, and whether it's been done this period.
3. **Complete a chore** — tap to mark done; records completion with timestamp and user.
4. **Rotation** — optional round-robin rotation between a list of users on each recurrence.
5. **Overdue indicator** — chores not completed by their due date are highlighted.
6. **Dashboard widget** — optional "My chores today" card on the Home dashboard (controlled by dashboard customisation).

### Schema changes

```prisma
model Chore {
  id              String          @id @default(cuid())
  name            String
  description     String?
  familyId        String
  family          Family          @relation(fields: [familyId], references: [id])
  recurrenceRule  String          // RRULE string — same pattern as Event
  assignedTo      String?         // userId — null = unassigned / shared
  rotation        String?         // JSON array of userIds for round-robin
  rotationIndex   Int             @default(0)
  isActive        Boolean         @default(true)
  completions     ChoreCompletion[]
  createdAt       DateTime        @default(now())
}

model ChoreCompletion {
  id          String   @id @default(cuid())
  choreId     String
  chore       Chore    @relation(fields: [choreId], references: [id], onDelete: Cascade)
  completedBy String   // userId
  completedAt DateTime @default(now())
  periodStart DateTime // start of the recurrence period this completion covers
}
```

Add `chores Chore[]` to the `Family` model.

### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Chore` and `ChoreCompletion` models |
| `prisma/migrations/*/migration.sql` | New migration |
| `src/app/(app)/chores/page.tsx` | New — roster page |
| `src/app/(app)/chores/ChoresClient.tsx` | New — client component with complete/add/edit actions |
| `src/app/api/chores/route.ts` | New — GET (list), POST (create) |
| `src/app/api/chores/[id]/route.ts` | New — PATCH, DELETE |
| `src/app/api/chores/[id]/complete/route.ts` | New — POST (mark complete for current period) |
| `src/components/chores/ChoreCard.tsx` | New — individual chore display |
| `src/components/chores/ChoreForm.tsx` | New — create/edit form |
| `src/components/layout/Sidebar.tsx` | Add "Chores" nav item |
| `src/components/layout/MobileNav.tsx` | Consider adding Chores to mobile nav (may need to expand to 6 items or use overflow) |
| `src/components/dashboard/ChoresSummaryCard.tsx` | New — "My chores today" dashboard card |
| `src/lib/dashboard-cards.ts` | Register new `chores-summary` card |

### Implementation notes

- **Recurrence calculation** uses a custom `calculateNextDueDate()` function (not RRULE) that handles daily/weekly/biweekly/monthly frequencies.
- **Two scheduling modes** (controlled by `triggerOnComplete` toggle):
  - *Schedule-based (default)*: next due date is based on the calendar schedule (e.g. "every Monday"). If you complete a Monday chore on Wednesday, it still shows as overdue for Monday.
  - *Completion-based*: next due date is calculated from when you actually completed it. So if you complete a Monday chore on Wednesday, the next due date is the following Monday from Wednesday.
- **Auto-rotation** (`autoRotateOnComplete`): when enabled, completing a chore automatically assigns it to the next family member in the roster (round-robin by name order).
- **End date**: if a chore has an end date and the next due date would exceed it, the chore is automatically deactivated.
- **Overdue**: a chore is overdue if `nextDueDate` is in the past — highlighted with an amber border and "⚠ Overdue" label.
- **Initial due date**: calculated on creation from the `startDate` (or today if not set), respecting `dayOfWeek` (weekly) or `dayOfMonth` (monthly).

### Docker / NAS impact

Schema migration (new columns on Chore table) + new `@radix-ui/react-switch` npm dependency. **Rebuild Docker image and redeploy — migration runs automatically on startup via `prisma migrate deploy`.**

### Acceptance criteria

- [x] Chores can be created with a name, assignee, and recurrence
- [x] Roster shows all active chores with assignee and completion status
- [x] Marking a chore done records the completion and calculates next due date
- [x] Overdue chores are visually highlighted with amber border
- [x] Auto-rotation advances assignee on completion when enabled
- [x] Two scheduling modes: schedule-based vs completion-based (triggerOnComplete toggle)
- [x] Start date and end date support for time-bounded chore schedules
- [x] "My chores today" card is available for the Home dashboard

---

## 6. Household Contacts

**Goal:** A family address book for doctors, schools, tradespeople, and emergency services — accessible from any device without opening a separate contacts app.

**Effort:** Low  
**Dependencies:** None

### Scope

1. **Contact model** — name, phone, email, category, address, notes.
2. **Contacts page** — searchable, filterable list grouped by category.
3. **Contact detail** — tap to call/email on mobile (tel: and mailto: links).
4. **Categories** — Medical, School, Emergency, Trades, Services, Other — with family-customisable additions.
5. **Dashboard widget** — not on Home by default; available as an optional dashboard card.

### Schema changes

```prisma
model Contact {
  id         String   @id @default(cuid())
  name       String
  phone      String?
  email      String?
  address    String?
  category   String   @default("Other")
  notes      String?
  isFavourite Boolean @default(false)
  familyId   String
  family     Family   @relation(fields: [familyId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Add `contacts Contact[]` to the `Family` model.

### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Contact` model |
| `prisma/migrations/*/migration.sql` | New migration |
| `src/app/(app)/contacts/page.tsx` | New — contacts list page |
| `src/app/(app)/contacts/ContactsClient.tsx` | New — search, filter, add/edit/delete |
| `src/app/api/contacts/route.ts` | New — GET, POST |
| `src/app/api/contacts/[id]/route.ts` | New — PATCH, DELETE |
| `src/components/contacts/ContactCard.tsx` | New — individual contact display with click-to-call |
| `src/components/contacts/ContactForm.tsx` | New — create/edit form |
| `src/components/layout/Sidebar.tsx` | Add "Contacts" nav item |

### Implementation notes

- Click-to-call: `<a href="tel:+61412345678">` — works natively on mobile devices in the PWA.
- Click-to-email: `<a href="mailto:doctor@clinic.com.au">`.
- Category filter: a row of toggle pills above the list. Default view shows all.
- Favourites: starred contacts float to the top of the list.
- Search: client-side filter across name, phone, email, and notes fields.
- This is intentionally simple — no photo upload, no sync with device contacts. Keep it a fast CRUD feature.

### Docker / NAS impact

Schema migration required. Standard redeploy.

### Acceptance criteria

- [ ] Contacts can be created, edited, and deleted
- [ ] List is searchable and filterable by category
- [ ] Phone numbers are click-to-call on mobile
- [ ] Email addresses are click-to-email
- [ ] Favourited contacts appear at the top of the list

---

## 7. Document Vault

**Goal:** Store scanned copies of important household documents (insurance policies, warranties, passports, school enrolments) with expiry reminders that link to the calendar.

**Effort:** High  
**Dependencies:** Requires file upload infrastructure decision; expiry reminders depend on push notifications or calendar integration

### Scope

1. **Document model** — name, category, file (stored on NAS volume), expiry date, notes.
2. **Vault page** — grid view of documents grouped by category with expiry indicators.
3. **File storage** — upload files to a Docker-mounted volume path (e.g. `/data/vault/`) rather than the DB.
4. **Expiry reminders** — optionally create a calendar event when an expiry date is set.
5. **Categories** — Insurance, Identity, Medical, Vehicle, Property, Warranties, Education, Other.

### Schema changes

```prisma
model VaultDocument {
  id          String    @id @default(cuid())
  name        String
  category    String    @default("Other")
  filePath    String    // relative path within the vault volume
  fileType    String    // MIME type
  fileSize    Int       // bytes
  expiryDate  DateTime?
  notes       String?
  familyId    String
  family      Family    @relation(fields: [familyId], references: [id])
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### Key implementation considerations

- **File storage:** files go to a Docker volume mount (`/data/vault/`), not the SQLite DB. The `Dockerfile` and `docker-compose.yml` need a new named volume (e.g. `homebase_vault`) mounted at `/app/data/vault`.
- **File serving:** a Next.js API route (`GET /api/vault/[id]/file`) streams the file from disk with appropriate `Content-Disposition` headers. Files are never served directly — always gated behind auth.
- **Upload:** use the browser `File` API + `FormData` POST to `/api/vault`. On the server, use `fs.writeFile` to save to the volume path.
- **Security:** validate file types (PDF, JPEG, PNG only recommended); enforce a max file size (e.g. 20MB); strip EXIF data from images optionally.
- **Expiry reminders:** when `expiryDate` is set, optionally call `POST /api/events` to create a yearly-recurring calendar event titled `"[Document name] expires"`.

### Docker / NAS impact

**Significant:** `docker-compose.yml` needs a new volume, `Dockerfile` may need `libvips` or similar for image handling. **This is the highest-complexity deployment change in the backlog.** Plan a dedicated deployment session.

### Acceptance criteria

- [ ] Documents can be uploaded (PDF, JPEG, PNG)
- [ ] Documents are accessible only to authenticated family members
- [ ] Expiry dates show a colour-coded indicator (green / amber / red)
- [ ] Optional calendar event is created on expiry date
- [ ] Files persist across container restarts via Docker volume
- [ ] File download is gated behind authentication

---

## 8. Budgeting Module

**Goal:** Track household income and spending by category, with a monthly view and the ability to link shopping list estimates to actual spend.

**Effort:** High  
**Dependencies:** Shopping List Price Estimates (P4 in backlog) recommended first

### Scope

1. **Transaction model** — amount, date, category, description, type (income/expense), optional list link.
2. **Budget page** — monthly summary with income, expenses, and balance. Category breakdown chart.
3. **Budget categories** — Groceries, Utilities, Medical, Transport, Education, Entertainment, Other — customisable.
4. **Monthly budget targets** — set a spending limit per category.
5. **Shopping list integration** — optionally "commit" a completed shopping list to the budget as an expense transaction.

### Schema changes

```prisma
model BudgetCategory {
  id           String        @id @default(cuid())
  name         String
  colour       String?
  monthlyLimit Float?
  familyId     String
  family       Family        @relation(fields: [familyId], references: [id])
  transactions Transaction[]
  createdAt    DateTime      @default(now())

  @@unique([familyId, name])
}

model Transaction {
  id               String          @id @default(cuid())
  amount           Float
  type             String          // income | expense
  description      String?
  date             DateTime
  categoryId       String?
  category         BudgetCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sourceListId     String?         // optional link to a List
  familyId         String
  family           Family          @relation(fields: [familyId], references: [id])
  createdBy        String
  createdAt        DateTime        @default(now())
}
```

### Implementation notes

- Monthly view: group transactions by `date` truncated to month. Show a summary bar (income vs expenses) and a doughnut chart by category using the existing charting approach in the app.
- Budget vs actual: `monthlyLimit` on `BudgetCategory` enables a progress bar showing spend vs limit.
- Shopping list commit: a "Mark as purchased" button on a completed shopping list calculates the total from `unitPrice × quantity` fields and creates a single `Transaction` of type `expense` in the Groceries category.
- This is intentionally a manual-entry budget (no bank sync) to keep complexity manageable and avoid OAuth/bank API complexity.

### Docker / NAS impact

Schema migration required. Standard redeploy.

### Acceptance criteria

- [ ] Transactions can be manually entered with date, amount, and category
- [ ] Monthly summary shows income, expenses, and balance
- [ ] Spending by category is visualised in a chart
- [ ] Monthly budget limits show progress bars against actual spend
- [ ] A completed shopping list can be committed as an expense transaction
- [ ] Budget categories are customisable per family

---

## 9. Push Notifications

**Goal:** Send timely reminders to family members on their devices — for upcoming calendar events, meal prep time, due to-dos, and overdue chores.

**Effort:** Medium  
**Dependencies:** PWA service worker already deployed; requires VAPID key setup

### Scope

1. **VAPID key generation** — generate and store keys in environment variables.
2. **Push subscription model** — store browser push subscriptions per user per device.
3. **Notification preferences** — per-user settings for which notification types to receive and how far in advance.
4. **Notification dispatch** — a server-side cron/scheduler that sends notifications at the right time.
5. **Notification types:** calendar event reminders, meal prep (e.g. "dinner in 30 min"), due to-do items, overdue chores.

### Schema changes

```prisma
model PushSubscription {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint     String   @unique
  p256dh       String   // public key
  auth         String   // auth secret
  userAgent    String?
  createdAt    DateTime @default(now())
}
```

Add notification preference fields to `User`:

```prisma
// Add to User model
notifyEventReminder  Boolean @default(true)
notifyMealPrep       Boolean @default(false)
notifyTodoDue        Boolean @default(true)
notifyChoresOverdue  Boolean @default(false)
notifyReminderMins   Int     @default(30)  // minutes before event
```

### Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `PushSubscription`; add notification prefs to `User` |
| `prisma/migrations/*/migration.sql` | New migration |
| `public/sw.js` | Already handles push events — verify handler is correct |
| `src/app/api/push/subscribe/route.ts` | New — POST to save subscription |
| `src/app/api/push/unsubscribe/route.ts` | New — DELETE subscription |
| `src/app/api/push/send/route.ts` | New — internal POST endpoint to dispatch a notification |
| `src/lib/push-notifications.ts` | New — VAPID signing, payload construction, dispatch logic |
| `src/lib/notification-scheduler.ts` | New — logic to determine which notifications are due |
| `src/app/api/cron/notifications/route.ts` | New — cron trigger endpoint (called by Docker cron job) |
| `src/components/settings/NotificationsTab.tsx` | New — subscription toggle + preference controls |
| `src/app/(app)/settings/page.tsx` | Add "Notifications" tab |
| `.env.example` | Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `docker/entrypoint.sh` | Add cron job entry to call notification endpoint on schedule |

### Implementation notes

- Use the `web-push` npm package for VAPID signing — well-maintained and straightforward.
- Generate VAPID keys once: `npx web-push generate-vapid-keys` → store in `.env.local` and NAS environment.
- The cron approach: add a `crontab` entry in the Docker container (or a `node-cron` job in a background process) that calls `GET /api/cron/notifications` every 5 minutes. The endpoint checks for events/meals/todos due in the notification window and dispatches push messages.
- Subscription flow: on first login (or from Settings), prompt the user to enable notifications. Call `Notification.requestPermission()`, then `serviceWorker.pushManager.subscribe()`, then `POST /api/push/subscribe` with the subscription object.
- iOS note: push notifications on iOS require iOS 16.4+ and the app must be installed as a PWA (added to home screen). Document this limitation in Settings.

### Docker / NAS impact

- `docker/entrypoint.sh` — add cron job
- `.env` — add VAPID keys
- Schema migration required
- **Copy updated entrypoint.sh and .env to NAS before redeploying**

### Acceptance criteria

- [ ] Users can enable/disable push notifications in Settings
- [ ] Notification preferences (types + advance notice) are saved per user
- [ ] Calendar event reminders arrive at the configured time in advance
- [ ] Notifications display correctly on both Android Chrome and iOS Safari (PWA)
- [ ] Unsubscribing removes the subscription from the database
- [ ] Failed/expired subscriptions are cleaned up gracefully

---

## 10. Family Activity Log

**Goal:** A lightweight audit trail showing recent changes across the app — who added items to lists, who created events, who modified the meal plan — useful for larger families and for undoing accidental changes.

**Effort:** Medium  
**Dependencies:** None

### Scope

1. **ActivityLog model** — entity type, action, actor, timestamp, snapshot of changed data.
2. **Log writes** — middleware or explicit calls on key mutations (list items, events, meal plans, notes).
3. **Activity feed** — a page (or Settings section) showing recent activity, filterable by type and family member.
4. **Soft undo** — for list item deletions, a brief "undo" toast (5 seconds) before the item is permanently deleted.

### Schema changes

```prisma
model ActivityLog {
  id          String   @id @default(cuid())
  familyId    String
  family      Family   @relation(fields: [familyId], references: [id])
  userId      String   // who did it
  action      String   // created | updated | deleted | completed
  entityType  String   // list_item | event | meal_plan | note | recipe
  entityId    String
  entityTitle String?  // human-readable label for display
  diff        String?  // JSON snapshot of what changed
  createdAt   DateTime @default(now())

  @@index([familyId, createdAt])
  @@index([familyId, entityType])
}
```

Add `activityLogs ActivityLog[]` to the `Family` model.

### Implementation notes

- Write log entries in the same API route handler as the mutation — keep it simple, no middleware magic. A shared `logActivity(params)` helper in `src/lib/activity-log.ts` keeps it a one-liner at each call site.
- `diff` field: for updates, store `{ before: {...}, after: {...} }` as JSON. Keep it shallow — no need to diff nested objects.
- Retention: add a cleanup job (can be part of the notification cron) that deletes log entries older than 90 days.
- The activity feed UI: a simple reverse-chronological list. Each entry: avatar + name, action description, entity link, relative timestamp. E.g. *"Sarah added 'milk' to Weekly Shop • 10 min ago"*.
- Soft undo for list item deletions: change the DELETE handler to a soft-delete first (add `deletedAt DateTime?` to `ListItem`), show the undo toast, then hard-delete after 5 seconds. The list query filters `WHERE deletedAt IS NULL`.

### Docker / NAS impact

Schema migration (new `ActivityLog` model; optional `deletedAt` on `ListItem`). Standard redeploy.

### Acceptance criteria

- [ ] Key mutations (list items, events, meal plans, notes) write activity log entries
- [ ] Activity feed page shows recent changes with actor, action, and timestamp
- [ ] Feed is filterable by entity type and family member
- [ ] Deleting a list item shows a 5-second undo toast
- [ ] Log entries older than 90 days are automatically cleaned up
- [ ] Activity log does not noticeably impact mutation response times

---

## 11. Automated DB Backups

**Goal:** Automatically snapshot the SQLite database file to a mounted NAS volume on a schedule, with a simple restore UI in Settings — protecting against accidental data loss.

**Effort:** Low  
**Dependencies:** None

### Scope

1. **Backup cron** — a scheduled job in Docker that copies `homebase.db` to a timestamped backup file.
2. **Backup storage** — a Docker volume (`homebase_backups`) mounted at `/app/data/backups/`.
3. **Backup list in Settings** — show available backups with timestamp and file size.
4. **One-click restore** — select a backup and restore it (with a confirmation prompt).
5. **Retention** — keep the last 30 daily backups; delete older ones automatically.

### Schema changes

None. Backups are filesystem operations only.

### Files to create / modify

| File | Change |
|---|---|
| `docker/entrypoint.sh` | Add cron job: daily backup at 2am + retention cleanup |
| `docker-compose.yml` | Add `homebase_backups` named volume; mount at `/app/data/backups` |
| `scripts/backup.sh` | New — backup script: copy DB, timestamp filename, delete old backups |
| `src/app/api/admin/backups/route.ts` | New — GET (list backups), POST (trigger manual backup) |
| `src/app/api/admin/backups/[filename]/restore/route.ts` | New — POST (restore from backup, admin only) |
| `src/components/settings/BackupsTab.tsx` | New — backup list with manual trigger and restore button |
| `src/app/(app)/settings/page.tsx` | Add "Backups" tab (admin only) |

### Backup script (`scripts/backup.sh`)

```bash
#!/bin/sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/app/data/backups
DB_PATH=/app/data/dev.db

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/homebase_${TIMESTAMP}.db"

# Retain last 30 backups
ls -t "$BACKUP_DIR"/homebase_*.db | tail -n +31 | xargs -r rm
echo "Backup complete: homebase_${TIMESTAMP}.db"
```

### Implementation notes

- The restore API: copy the selected backup file over the live `homebase.db`. This requires briefly taking the app into a maintenance state — simplest approach is to close all Prisma connections, copy the file, then restart the process. In a Docker context, the admin can also trigger a container restart after restore.
- Restore is admin-only — check `user.role === 'admin'` in the API route.
- Manual backup trigger: a "Back up now" button in Settings that calls `POST /api/admin/backups`. Useful before making risky changes.
- Show backup age colour-coding in the UI: green (< 1 day), amber (1–3 days), red (> 3 days).
- NAS advantage: since the app runs on a Synology NAS, the backup volume can also be included in Synology's own snapshot/backup schedule for extra redundancy.

### Docker / NAS impact

- `docker-compose.yml` updated — **copy to NAS**
- `docker/entrypoint.sh` updated — **copy to NAS**
- New `homebase_backups` volume created on first deploy with updated compose file

### Acceptance criteria

- [ ] Database is backed up automatically once per day
- [ ] Last 30 daily backups are retained; older files are deleted
- [ ] Admin can trigger a manual backup from Settings
- [ ] Backup list shows filename, timestamp, and file size
- [ ] Admin can restore from any listed backup with a confirmation prompt
- [ ] Backup volume persists across container restarts and upgrades

---

## 12. Offline PWA — Background Sync

**Goal:** Allow family members to check off shopping list items and add new items while offline (e.g. in a supermarket with poor signal), with changes syncing automatically when connectivity returns.

**Effort:** High  
**Dependencies:** Existing PWA service worker; Shopping List features

### Scope

1. **Offline detection** — show a banner when the app is offline.
2. **Optimistic list updates** — list item check/uncheck and new item adds update the UI immediately, queued for sync.
3. **Background sync** — the service worker replays queued mutations when connectivity returns using the Background Sync API.
4. **Conflict resolution** — last-write-wins for item completion; for adds, all queued items are created.
5. **Sync status indicator** — show pending sync count on the list page.

### Key technical considerations

- **Background Sync API** — supported in Chrome/Android. Limited on iOS Safari (fallback: sync on next page load/focus).
- **IndexedDB queue** — mutations are stored in IndexedDB (not `localStorage` — larger storage, async API). The service worker reads from IndexedDB to replay on sync.
- **Scope** — limit initial implementation to list item operations only (completion toggle + item add). Do not attempt to offline the full app.
- **Prisma/API compatibility** — the sync replay just calls the existing API endpoints. No server-side changes needed beyond ensuring the endpoints are idempotent (check/uncheck is already idempotent).

### Files to create / modify

| File | Change |
|---|---|
| `public/sw.js` | Add `sync` event handler; IndexedDB queue read/replay logic |
| `src/lib/offline-queue.ts` | New — client-side IndexedDB queue write helpers |
| `src/components/lists/ShoppingList.tsx` | Use offline queue for mutations; optimistic UI updates |
| `src/components/lists/ListItemRow.tsx` | Optimistic completion toggle |
| `src/components/layout/OfflineBanner.tsx` | New — offline indicator banner |
| `src/app/(app)/layout.tsx` | Mount `<OfflineBanner>` |

### Implementation notes

- iOS fallback: on `window focus` and `online` events, flush the IndexedDB queue by calling the API directly from the client (no service worker required for this path).
- The queue entry format: `{ id: uuid, endpoint: '/api/lists/x/items/y', method: 'PATCH', body: {...}, queuedAt: timestamp }`.
- Conflict note: if another family member checked off the same item while the user was offline, the sync will send a redundant PATCH — which is fine since the end state (completed) is the same.
- This is a significant piece of work. Recommend building it as a standalone feature branch and testing thoroughly on real mobile devices before merging.

### Docker / NAS impact

No schema changes. `public/sw.js` updated — standard redeploy. Ensure the NAS serve headers for `/sw.js` remain `no-cache` (already set in `next.config.ts`).

### Acceptance criteria

- [ ] App shows an offline banner when network is unavailable
- [ ] List item completion toggles work offline with optimistic UI
- [ ] New list items can be added offline
- [ ] Queued mutations sync automatically when connectivity returns
- [ ] No duplicate items or lost completions after sync
- [ ] Sync works on both Android Chrome and iOS Safari (PWA mode)

---

## 13. Weekly Family Summary

**Goal:** A digest view on the Home dashboard — or optionally delivered as a push notification — summarising the week ahead: upcoming events, planned meals, due to-dos, and any birthdays/anniversaries.

**Effort:** Medium  
**Dependencies:** Dashboard Customisation (P5 in priority list) recommended first; optionally Push Notifications

### Scope

1. **Weekly summary card** — a new dashboard card showing a 7-day overview, available as an optional card via dashboard customisation.
2. **Summary sections:** events this week, meals planned vs unplanned, to-dos due this week, birthdays/anniversaries.
3. **Weekly email/notification digest** — optional Monday morning summary delivered as a push notification or (future) email.
4. **Print/export** — a "print week" button that renders a clean one-page summary suitable for putting on the fridge.

### Schema changes

None — the weekly summary is a read-only aggregation of existing data.

### Files to create / modify

| File | Change |
|---|---|
| `src/components/dashboard/WeeklySummaryCard.tsx` | New — summary card component |
| `src/app/(app)/home/page.tsx` | Add weekly summary data fetch when card is enabled |
| `src/app/api/dashboard/weekly-summary/route.ts` | New — aggregates events, meals, todos, birthdays for next 7 days |
| `src/lib/dashboard-cards.ts` | Register `weekly-summary` card |
| `src/app/(app)/home/WeeklySummaryPage.tsx` | New — full-page printable weekly view |
| `src/app/api/cron/weekly-digest/route.ts` | New — triggered Monday morning to dispatch push notification digest |

### Implementation notes

- The summary card shows a compact 7-row grid (one per day): day name, event count, meal plan status (planned / empty), to-do count.
- Meals planned indicator: a coloured dot per meal type (breakfast/lunch/dinner) — green if planned, grey if empty.
- Print view: triggered by `window.print()` with a `@media print` stylesheet that hides the sidebar and nav and renders just the weekly grid.
- Weekly digest notification: a single push notification sent Monday at 8am (family timezone) with a summary string e.g. *"This week: 4 events, 5 dinners planned, 3 to-dos due. Sarah's birthday on Thursday!"*

### Docker / NAS impact

No schema changes. If digest notifications are added, `entrypoint.sh` cron updated. Standard redeploy.

### Acceptance criteria

- [ ] Weekly summary card is available as an optional dashboard card
- [ ] Card shows a 7-day view of events, meal plan status, and to-dos
- [ ] Birthdays/anniversaries this week are highlighted
- [ ] Print view renders a clean one-page weekly summary
- [ ] (Optional) Weekly digest push notification is sent Monday morning

---

*Document generated from codebase review of `C:\Appdev\HomeBase` — April 2026.*  
*Companion document: `homebase-feature-suggestions-and-plans.md`*
