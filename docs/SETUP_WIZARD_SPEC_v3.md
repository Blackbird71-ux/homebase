# Homebase — Setup Wizard: Build Specification v3 (Final)

> **For the AI agent:** Read this entire document before writing a single line of code.
> All file paths are relative to `C:\Appdev\HomeBase`.
> Stack: Next.js 15 App Router, TypeScript, Prisma 7 (SQLite), NextAuth v5,
> Tailwind CSS v4, shadcn/ui (base-ui — NOT Radix), Lucide icons.
> Builds on Windows, deploys via Docker to Synology NAS.
> `prisma migrate deploy` runs automatically in `docker/entrypoint.sh` on every
> container start — no manual migration steps needed on either environment.

---

## Design Philosophy

The wizard has one job: **get the family to a working app in under 3 minutes**.
It does not teach the app. It does not show a feature tour. It does not ask for
anything that isn't immediately needed to prevent empty states or errors.

Four steps. One escape hatch. One finish button. Done.

A **separate app tour** will be built later and accessed via the existing Help
button (top-right of every page). The wizard deliberately does not do this.

---

## What the Wizard Collects (and Why)

| Data | Why it's needed at setup |
|---|---|
| Family name + timezone | Timezone affects every date/time display; wrong timezone = wrong calendar times |
| Birthdays | Without them the birthday reminder widget on the home dashboard shows nothing |
| Shopping list name | Without a list, the shopping widget shows nothing and Lists page looks broken |
| To-do list name | Same — the to-do widget and Lists page look empty |
| Key contacts | Contacts page is otherwise empty; emergency numbers are high-value low-effort |
| Chores | Chore schedule widget is empty without them |
| Currency + bank accounts | Finance dashboard shows $0 across everything without at least one account |
| Recurring bills | Bills widget is empty; users expect to see their regular bills on first visit |

**Not collected by the wizard** (handled elsewhere or auto-seeded):
- Theme — change any time in Settings → Appearance
- Finance categories — auto-seeded when Finance page is first visited
- Event categories — auto-seeded when Calendar is first visited
- Ingredient/shopping categories — auto-seeded when Lists page is first visited
- Savings goals, locations, vendors, entities — available in Finance section
- Recipes, meal plans, documents, notes — naturally discovered features

---

## The Three Guards Against Re-Running

The wizard must be blocked at three independent layers. All three are required.

### Guard A — Migration: auto-complete for existing families

```sql
-- File: prisma/migrations/20260514000000_add_setup_wizard/migration.sql

ALTER TABLE "Family" ADD COLUMN "setupWizardCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Existing families (already have users) are immediately marked complete.
-- Only brand-new families (empty User table) keep the default false.
UPDATE "Family"
SET "setupWizardCompleted" = true
WHERE id IN (SELECT DISTINCT "familyId" FROM "User");
```

Add to `prisma/schema.prisma` in the `Family` model after `budgetIncomeStreams`:

```prisma
setupWizardCompleted Boolean @default(false)
```

### Guard B — Layout redirect (admins only, new families only)

**Modify `src/app/(app)/layout.tsx`:**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  if (session.user.role === 'admin') {
    const family = await prisma.family.findUnique({
      where: { id: session.user.familyId },
      select: { setupWizardCompleted: true },
    })
    if (family && !family.setupWizardCompleted) {
      redirect('/setup')
    }
  }

  return <AppShell>{children}</AppShell>
}
```

> ⚠️ **Critical:** `src/app/setup/` MUST be outside `src/app/(app)/`. If it is
> placed inside the `(app)` route group, this layout wraps it, the redirect fires
> on the wizard page itself, and the user gets an infinite redirect loop. The
> `setup` directory belongs directly under `src/app/`, not under `src/app/(app)/`.

### Guard C — Server-side lockout on page and API

Both `src/app/setup/page.tsx` and `src/app/api/setup-wizard/route.ts` must
independently check `setupWizardCompleted` and return 403 / redirect if it is
already `true`. This blocks direct URL access and direct API calls after completion.

---

## Files to Create / Modify

| Action | Path |
|---|---|
| CREATE | `prisma/migrations/20260514000000_add_setup_wizard/migration.sql` |
| MODIFY | `prisma/schema.prisma` — add `setupWizardCompleted` field to `Family` model |
| CREATE | `src/app/api/setup-wizard/route.ts` |
| CREATE | `src/app/setup/page.tsx` |
| CREATE | `src/app/setup/SetupWizard.tsx` |
| MODIFY | `src/app/(app)/layout.tsx` — add wizard redirect guard |

---

## The Wizard UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  🏠 Homebase  ·  Getting started          Step 2 of 4        │
├────────────────┬─────────────────────────────────────────────┤
│  ✓ Household   │                                             │
│  ◉ Lists &     │      Active step content                    │
│    Contacts    │      (scrollable)                           │
│  ○ Chores      │                                             │
│  ○ Finances    │                                             │
│                │                                             │
│                ├─────────────────────────────────────────────┤
│                │  [Skip →]   [← Back]      [Continue →]     │
└────────────────┴─────────────────────────────────────────────┘
```

- Full viewport: `h-screen flex flex-col overflow-hidden` — no outer scroll
- Header: `shrink-0 flex items-center justify-between px-6 py-4 border-b border-border`
  - Left: house icon + "Homebase · Getting started"
  - Right: "Step N of 4" in `text-sm text-muted-foreground`
- Body: `flex flex-1 overflow-hidden`
- Left nav: `hidden md:flex flex-col w-52 shrink-0 border-r border-border`
  - Background: `bg-[var(--sidebar)]`
  - Each step item: icon + label. Completed = `text-muted-foreground` + `<Check />` icon.
    Active = `text-foreground font-medium` + filled dot. Upcoming = `text-muted-foreground`.
  - Steps are **not clickable** — no jumping ahead or back via the nav
- Right panel: `flex flex-col flex-1 overflow-hidden`
  - Content area: `flex-1 overflow-y-auto p-6 md:p-8`
  - Bottom bar: `shrink-0 border-t border-border px-6 py-4 flex items-center justify-between`
- Mobile (< md): left nav hidden, show a `h-1` progress bar at top of right panel

### Bottom bar buttons

```
[Skip this step →]          [← Back]  [Continue →]
```

- "Skip this step": `variant="ghost" size="sm"`, visible only on steps 2, 3, 4
- "Back": `variant="outline"`, hidden on step 1
- "Continue" / "Finish Setup": `variant="default"`, right-aligned
  - Label: "Continue →" on steps 1–3, "Finish Setup →" on step 4
  - Shows spinner and is disabled while the API call is in progress

### Escape hatch

On step 1 only, below the form, a small muted link:

```tsx
<button
  type="button"
  onClick={handleSkipAll}
  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
>
  Skip setup and go straight to the app →
</button>
```

`handleSkipAll` calls `POST /api/setup-wizard` with an empty payload
(all arrays empty, names blank). The API treats this as "complete with defaults":
seeds finance categories, event categories, sets `setupWizardCompleted = true`,
then the client does `router.push('/home')`.

This is important — some users want to explore before committing to questions.
Giving them an exit means they won't resent the wizard.

---

## Step 1 — Your Household

**Heading:** "Welcome to Homebase 🏠"
**Subheading:** "Let's get the basics right. This takes about 2 minutes."

### Fields

**Family name** *(mandatory)*
```tsx
<Label htmlFor="family-name">Family name *</Label>
<Input
  id="family-name"
  value={data.family.name}
  onChange={e => updateFamily({ name: e.target.value })}
  placeholder="e.g. The Smiths"
/>
```
Validate on Continue: `name.trim().length > 0`. If empty: show
`<p className="text-sm text-destructive mt-1">Family name is required.</p>` and
do not advance.

**Timezone** *(mandatory)*
```tsx
<Label htmlFor="timezone">Timezone *</Label>
<select
  id="timezone"
  value={data.family.timezone}
  onChange={e => updateFamily({ timezone: e.target.value })}
  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
>
  {SUPPORTED_TIMEZONES.map(tz => (
    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
  ))}
</select>
```
Import `SUPPORTED_TIMEZONES` from `@/app/api/settings/family/route`.
Pre-fill from `props.timezone`.

**Birthdays** *(optional)*

Small callout before the builder:
```tsx
<Callout type="info">
  Without birthdays, the birthday reminder widget on your dashboard won't show anything.
</Callout>
```

Repeating row builder. Each row:
- Name: `<Input placeholder="e.g. Sarah" />`
- Type: native `<select>`: Person / Anniversary
- Month: native `<select>` (Jan–Dec, options 1–12 with month names)
- Day: native `<select>` (1–31)

"+ Add birthday" button. "×" remove button per row. Start with 0 rows.

Stored as `{ name, type, date }` where `date` is `"MM-DD"` (zero-padded month + day).

---

## Step 2 — Lists & Contacts

**Heading:** "Lists & Contacts"
**Subheading:** "Create your first lists and add any important contacts."

### Section A: Lists

**Pre-fill awareness:** Fetch `existingCounts.lists` (passed from server).
If `existingCounts.lists > 0`, show:
```tsx
<Callout type="info">
  Your family already has {existingCounts.lists} list{existingCounts.lists !== 1 ? 's' : ''}.
  Any lists created here will be added alongside them.
</Callout>
```

Two inputs:

| Field | Default value | Notes |
|---|---|---|
| Shopping list name | `"Weekly Shopping"` | Clear to skip creating it |
| To-do list name | `"Family To-Do"` | Clear to skip creating it |

```tsx
<Callout type="warning">
  If both fields are left blank, the shopping and to-do widgets on your dashboard
  will show nothing until you create lists manually.
</Callout>
```

### Section B: Contacts

**Pre-fill awareness:** If `existingCounts.contacts > 0`, show info callout.

Simple flat list — no separate emergency/doctor sections. One unified builder.

Each row:
- Name: `<Input placeholder="e.g. Dr. Chen" />` *(required per row)*
- Phone: `<Input placeholder="e.g. 02 9123 4567" type="tel" />`
- Category: native `<select>`: Emergency / Doctor / School / Tradesperson / Other

"+ Add contact" button. "×" remove per row. Start with 0 rows.

```tsx
<Callout type="info">
  Skip this if you're not ready. You can add contacts any time in the Contacts section.
</Callout>
```

Row validation: if a row exists and name is blank, show red border on name and
do not allow Continue.

---

## Step 3 — Chores

**Heading:** "Household Chores"
**Subheading:** "Set up recurring tasks. They'll appear on your home dashboard."

**Pre-fill awareness:** If `existingCounts.chores > 0`, show info callout.

### Quick-add chips

Shown above the builder. Each chip adds a pre-filled row:

```
Vacuuming  ·  Mopping  ·  Dishes  ·  Bins  ·  Groceries
Laundry  ·  Lawn mowing  ·  Bathrooms  ·  Cleaning
```

Chip style:
```tsx
<button
  type="button"
  onClick={() => addChoreFromChip(title)}
  className="px-3 py-1 rounded-full border border-border text-sm hover:bg-accent transition-colors"
>
  + {title}
</button>
```

### Row builder

Each row:

| Field | Type | Default |
|---|---|---|
| Title | `<Input placeholder="e.g. Vacuuming" />` | "" |
| Frequency | native `<select>` | Weekly |
| Assigned to | native `<select>` | Unassigned |

Frequency options: Daily / Weekly / Fortnightly / Monthly
(maps to DB values: `daily` / `weekly` / `biweekly` / `monthly`)

Assigned to options: "Unassigned" (value: `null`) + each entry from
`props.familyMembers`.

"+ Add chore" button. "×" remove per row. Start with 0 rows.

Row validation: title required if row exists.

```tsx
<Callout type="info">
  Skip this if you're not ready. The chore schedule on the dashboard will show
  nothing until chores are created.
</Callout>
```

---

## Step 4 — Finances

**Heading:** "Finance Setup"
**Subheading:** "Add your accounts and regular bills so the finance dashboard
has something to show."

```tsx
<Callout type="info">
  Finance categories (Groceries, Electricity, etc.) are set up automatically —
  you don't need to create them here.
</Callout>
```

**Pre-fill awareness:** If `existingCounts.accounts > 0` or
`existingCounts.bills > 0`, show:
```tsx
<Callout type="info">
  Your family already has some finance data (
  {existingCounts.accounts} account{existingCounts.accounts !== 1 ? 's' : ''},
  {' '}{existingCounts.bills} bill{existingCounts.bills !== 1 ? 's' : ''}).
  Items added here will be created alongside them.
</Callout>
```

### Section A: Currency

```tsx
<Label htmlFor="currency">Default currency</Label>
<select id="currency" value={data.finance.currency} onChange={...}
  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
  <option value="AUD">AUD — Australian Dollar</option>
  <option value="USD">USD — US Dollar</option>
  <option value="GBP">GBP — British Pound</option>
  <option value="EUR">EUR — Euro</option>
  <option value="NZD">NZD — New Zealand Dollar</option>
  <option value="SGD">SGD — Singapore Dollar</option>
  <option value="JPY">JPY — Japanese Yen</option>
  <option value="CAD">CAD — Canadian Dollar</option>
</select>
```

Default: `"AUD"`.

### Section B: Bank Accounts

Preset chips: `Everyday` · `Savings` · `Credit Card` · `Offset` · `Joint`

Each chip adds a row pre-filled as:
- Everyday → name: "Everyday Account", type: checking
- Savings → name: "Savings Account", type: savings
- Credit Card → name: "Credit Card", type: credit
- Offset → name: "Offset Account", type: savings
- Joint → name: "Joint Account", type: checking

Row builder. Start with 0 rows.

Each row:

| Field | Type | Default |
|---|---|---|
| Account name | `<Input placeholder="e.g. Everyday Account" />` | "" |
| Type | native `<select>`: Checking / Savings / Credit Card / Cash | Checking |
| Institution | `<Input placeholder="e.g. CommBank" />` (optional) | "" |
| Current balance | `<Input type="number" placeholder="0" />` | 0 |

Row validation: name required.

```tsx
<Callout type="warning">
  Without at least one account, the Finance dashboard will show $0 for everything.
</Callout>
```

### Section C: Recurring Bills

Preset chips:
`Mortgage/Rent` · `Electricity` · `Gas` · `Water` · `Internet` · `Mobile Phone` ·
`Netflix` · `Spotify` · `Council Rates` · `Insurance`

Row builder. Start with 0 rows.

Each row:

| Field | Type | Default |
|---|---|---|
| Bill name | `<Input placeholder="e.g. Netflix" />` | "" |
| Amount | `<Input type="number" placeholder="0" min="0" step="0.01" />` | "" |
| Frequency | native `<select>`: Weekly / Fortnightly / Monthly / Quarterly / Annual | Monthly |

Row validation: name required AND amount must be a number > 0.

```tsx
<Callout type="warning">
  Without bills, the Bills to Pay widget on the dashboard will show nothing.
</Callout>
```

---

## Finish Screen (shown after step 4 API succeeds, before redirect)

Not a step — a transient full-panel state while saving and immediately after:

**While saving:**
```tsx
<div className="flex flex-col items-center justify-center h-full gap-4">
  <Loader2 className="h-8 w-8 animate-spin text-primary" />
  <p className="text-sm text-muted-foreground">Setting up your Homebase...</p>
</div>
```

**On success:** `router.push('/home')` immediately — no intermediate screen.

**On error:**
```tsx
<div className="rounded-lg bg-destructive/10 text-destructive p-4 text-sm">
  <p className="font-medium">Something went wrong</p>
  <p className="mt-1">{errorMessage}</p>
</div>
```
Finish button resets to "Finish Setup →" and is re-enabled. User can retry.
The API is safe to retry — `setupWizardCompleted` only becomes `true` on a
successful transaction commit, so a failed attempt leaves it `false`.

---

## State Management

Single `useState` for the entire payload:

```typescript
const [data, setData] = useState<WizardPayload>(() => ({
  family: {
    name: props.familyName,
    timezone: props.timezone,
    birthdays: [],
  },
  lists: {
    shoppingListName: 'Weekly Shopping',
    todoListName: 'Family To-Do',
  },
  contacts: [],
  chores: [],
  finance: {
    currency: 'AUD',
    accounts: [],
    bills: [],
  },
}))

const [step, setStep] = useState(1)
const [saving, setSaving] = useState(false)
const [error, setError] = useState<string | null>(null)
```

Typed partial updaters per section:
```typescript
const updateFamily = (patch: Partial<WizardPayload['family']>) =>
  setData(d => ({ ...d, family: { ...d.family, ...patch } }))

const updateLists = (patch: Partial<WizardPayload['lists']>) =>
  setData(d => ({ ...d, lists: { ...d.lists, ...patch } }))

// etc.
```

---

## WizardPayload Type

```typescript
interface WizardPayload {
  family: {
    name: string
    timezone: string
    birthdays: Array<{
      name: string
      type: 'person' | 'anniversary'
      date: string  // "MM-DD" e.g. "03-15" for 15 March
    }>
  }
  lists: {
    shoppingListName: string  // empty string = skip
    todoListName: string      // empty string = skip
  }
  contacts: Array<{
    name: string
    phone?: string
    category: 'emergency' | 'doctor' | 'school' | 'tradesperson' | 'other'
  }>
  chores: Array<{
    title: string
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    assigneeId: string | null
  }>
  finance: {
    currency: string
    accounts: Array<{
      name: string
      type: 'checking' | 'savings' | 'credit' | 'cash'
      institution?: string
      currentBalance: number
    }>
    bills: Array<{
      name: string
      amount: number
      frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual'
    }>
  }
}
```

---

## API Route: `src/app/api/setup-wizard/route.ts`

### Full guard sequence (before any writes)

```typescript
export async function POST(req: Request) {
  const user = await requireSession()

  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { setupWizardCompleted: true },
  })

  if (!family) {
    return NextResponse.json({ error: 'Family not found' }, { status: 404 })
  }
  if (family.setupWizardCompleted) {
    return NextResponse.json(
      { error: 'Setup wizard has already been completed.' },
      { status: 403 }
    )
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can run the setup wizard' }, { status: 403 })
  }

  const payload: WizardPayload = await req.json()
  // ... proceed
}
```

### Transaction (all writes in one `prisma.$transaction`)

```typescript
await prisma.$transaction(async (tx) => {

  // 1. Family settings + mark wizard complete
  const familyUpdate: Record<string, unknown> = { setupWizardCompleted: true }
  if (payload.family.name?.trim()) {
    familyUpdate.name = payload.family.name.trim()
  }
  if (SUPPORTED_TIMEZONES.includes(payload.family.timezone as any)) {
    familyUpdate.timezone = payload.family.timezone
  }
  if (payload.family.birthdays?.length > 0) {
    familyUpdate.birthdays = JSON.stringify(payload.family.birthdays)
  }
  await tx.family.update({ where: { id: user.familyId }, data: familyUpdate })

  // 2. Finance default entity (only if none exists)
  const hasEntity = await tx.financeEntity.findFirst({
    where: { familyId: user.familyId, isDefault: true },
    select: { id: true },
  })
  if (!hasEntity) {
    await tx.financeEntity.create({
      data: {
        name: 'Personal / Family',
        type: 'personal',
        description: 'Default household income and expenses',
        color: '#6366F1',
        isDefault: true,
        sortOrder: 0,
        isActive: true,
        familyId: user.familyId,
      },
    })
  }

  // 3. Event categories (only if none exist)
  const eventCatCount = await tx.eventCategory.count({
    where: { familyId: user.familyId },
  })
  if (eventCatCount === 0) {
    const defaults = [
      { name: 'Medical', color: '#ef4444' },
      { name: 'School',  color: '#3b82f6' },
      { name: 'Social',  color: '#8b5cf6' },
      { name: 'Work',    color: '#f59e0b' },
      { name: 'Other',   color: '#6b7280' },
    ]
    for (const [i, cat] of defaults.entries()) {
      await tx.eventCategory.create({
        data: {
          name: cat.name, color: cat.color,
          isSystem: true, sortOrder: i * 10,
          familyId: user.familyId,
        },
      })
    }
  }

  // 4. Shopping list
  if (payload.lists.shoppingListName?.trim()) {
    await tx.list.create({
      data: {
        name: payload.lists.shoppingListName.trim(),
        type: 'SHOPPING', isActive: true,
        createdBy: user.id, familyId: user.familyId,
      },
    })
  }

  // 5. To-do list
  if (payload.lists.todoListName?.trim()) {
    await tx.list.create({
      data: {
        name: payload.lists.todoListName.trim(),
        type: 'TODO', isActive: true,
        createdBy: user.id, familyId: user.familyId,
      },
    })
  }

  // 6. Contacts
  for (const c of (payload.contacts ?? [])) {
    if (!c.name?.trim()) continue
    await tx.householdContact.create({
      data: {
        name: c.name.trim(),
        category: c.category ?? 'other',
        phone: c.phone || null,
        familyId: user.familyId,
      },
    })
  }

  // 7. Chores
  // Copy calculateInitialDueDate from src/app/api/chores/route.ts into this file
  for (const chore of (payload.chores ?? [])) {
    if (!chore.title?.trim()) continue
    const nextDueDate = calculateInitialDueDate(
      chore.frequency ?? 'weekly',
      null,   // dayOfWeek — not collected in wizard
      null,   // dayOfMonth — not collected in wizard
      null    // startDate — defaults to today
    )
    await tx.chore.create({
      data: {
        title: chore.title.trim(),
        frequency: chore.frequency ?? 'weekly',
        currentAssigneeId: chore.assigneeId || null,
        nextDueDate,
        rotationInterval: 1,
        isActive: true,
        familyId: user.familyId,
      },
    })
  }

  // 8. Finance accounts
  for (const [i, acc] of (payload.finance.accounts ?? []).entries()) {
    if (!acc.name?.trim()) continue
    await tx.financeAccount.create({
      data: {
        name: acc.name.trim(),
        type: acc.type ?? 'checking',
        institution: acc.institution || null,
        currency: payload.finance.currency ?? 'AUD',
        currentBalance: acc.currentBalance ?? 0,
        isActive: true,
        sortOrder: i,
        familyId: user.familyId,
      },
    })
  }

  // 9. Finance bills
  const nextMonthStart = new Date()
  nextMonthStart.setDate(1)
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1)
  nextMonthStart.setHours(0, 0, 0, 0)

  for (const bill of (payload.finance.bills ?? [])) {
    if (!bill.name?.trim() || !bill.amount || bill.amount <= 0) continue
    await tx.financeRecurringBill.create({
      data: {
        name: bill.name.trim(),
        amount: bill.amount,
        frequency: bill.frequency ?? 'monthly',
        nextDueDate: nextMonthStart,
        isActive: true,
        billType: 'recurring',
        familyId: user.familyId,
      },
    })
  }

}) // end transaction

// After transaction: seed finance categories (idempotent, uses global prisma)
await seedFinanceCategories(user.familyId)

return NextResponse.json({ success: true })
```

> **Why `setupWizardCompleted = true` is set inside the transaction:**
> If any step fails, the whole transaction rolls back including this flag.
> The user can retry. Only a full commit locks the wizard permanently.

> **Why `seedFinanceCategories` is outside the transaction:**
> It uses `prisma.financeCategory.createMany` and is idempotent.
> Running it inside a SQLite transaction alongside many other writes
> risks lock contention. It is safe to call outside — it always checks
> first and only inserts missing categories.

---

## Server Component: `src/app/setup/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { SetupWizard } from './SetupWizard'

export default async function SetupPage() {
  const session = await requireSession()

  // Guard C (page-level): block non-admins and already-completed families
  if (session.role !== 'admin') redirect('/home')

  const [family, familyMembers, existingCounts] = await Promise.all([
    prisma.family.findUnique({
      where: { id: session.familyId },
      select: { setupWizardCompleted: true, name: true, timezone: true },
    }),
    prisma.user.findMany({
      where: { familyId: session.familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    Promise.all([
      prisma.list.count({ where: { familyId: session.familyId } }),
      prisma.householdContact.count({ where: { familyId: session.familyId } }),
      prisma.chore.count({ where: { familyId: session.familyId } }),
      prisma.financeAccount.count({ where: { familyId: session.familyId } }),
      prisma.financeRecurringBill.count({ where: { familyId: session.familyId } }),
    ]).then(([lists, contacts, chores, accounts, bills]) => ({
      lists, contacts, chores, accounts, bills,
    })),
  ])

  if (!family) redirect('/home')
  if (family.setupWizardCompleted) redirect('/home')

  return (
    <SetupWizard
      familyName={family.name}
      timezone={family.timezone}
      userId={session.id}
      familyMembers={familyMembers}
      existingCounts={existingCounts}
    />
  )
}
```

Note: `src/app/setup/page.tsx` does NOT import or use `AppShell`. It renders
the wizard component directly. No sidebar, no top bar, no nav.

---

## Reusable Callout Component (inline in SetupWizard.tsx)

```tsx
function Callout({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <div className={cn(
      'flex gap-2.5 rounded-lg p-3 text-sm',
      type === 'warning'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    )}>
      <span className="shrink-0 mt-px">{type === 'warning' ? '⚠️' : 'ℹ️'}</span>
      <span>{children}</span>
    </div>
  )
}
```

---

## Handling the "Skip All" Path

When `handleSkipAll` is called:

```typescript
async function handleSkipAll() {
  setSaving(true)
  try {
    const emptyPayload: WizardPayload = {
      family: { name: '', timezone: '', birthdays: [] },
      lists: { shoppingListName: '', todoListName: '' },
      contacts: [],
      chores: [],
      finance: { currency: 'AUD', accounts: [], bills: [] },
    }
    const res = await fetch('/api/setup-wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emptyPayload),
    })
    if (res.ok) {
      router.push('/home')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong.')
      setSaving(false)
    }
  } catch {
    setError('Network error. Please try again.')
    setSaving(false)
  }
}
```

The API handles empty strings and empty arrays gracefully — nothing is written
for those, but `setupWizardCompleted` is still set to `true` and the default
finance entity + event categories are still seeded.

---

## Validation Summary

| Step | Field | Rule | UI on fail |
|---|---|---|---|
| 1 | Family name | `trim().length > 0` | Red text below field; Continue stays enabled but shows error on click |
| 1 | Timezone | Must be in SUPPORTED_TIMEZONES | Should not be possible via the select, but API validates too |
| 2 | Contact rows | Name required if row exists and has any other field filled | Red border on name input |
| 3 | Chore rows | Title required if row exists | Red border on title input |
| 4 | Account rows | Name required if row exists | Red border on name input |
| 4 | Bill rows | Name required AND amount > 0 if row exists | Red border on offending field |

All validation is per-row. An empty row (all blank fields) is treated as "not
started" and is silently skipped by the API rather than causing an error.

---

## Testing Checklist

- [ ] **Existing family migration.** Run migration against a DB that has users. All families should have `setupWizardCompleted = 1`. No existing admin sees the wizard on next login.
- [ ] **Fresh install.** Empty DB. Admin registers, logs in, is redirected to `/setup`.
- [ ] **Step 1 blank name.** Continue shows validation error, does not advance.
- [ ] **Skip all link.** Clicking "Skip setup" calls API with empty payload, redirects to `/home`.
- [ ] **Skip a step.** Clicking "Skip this step" on step 3 advances without validation.
- [ ] **Full completion.** All 4 steps filled and finished. Records appear in DB and in each app section.
- [ ] **Finance categories auto-seeded.** Visit `/finance` after wizard — categories exist.
- [ ] **Event categories auto-seeded.** Visit `/calendar` — event categories exist.
- [ ] **Post-completion: /setup redirects.** Visiting `/setup` after completion → `/home`.
- [ ] **Post-completion: API blocked.** `POST /api/setup-wizard` after completion → 403.
- [ ] **Non-admin: /setup redirects.** Member user visiting `/setup` → `/home`.
- [ ] **No infinite loop.** `src/app/setup/` is outside `src/app/(app)/`. Layout redirect does not fire on the wizard page.
- [ ] **API failure.** Simulate DB error on step 4. Error message shown. Retry works. `setupWizardCompleted` stays `false`.
- [ ] **Mobile layout.** Left nav hidden. Progress bar visible. Bottom bar accessible.
- [ ] **Docker/NAS.** Deploy image. Migration runs in `entrypoint.sh`. Fresh container correctly shows wizard for new admin.
