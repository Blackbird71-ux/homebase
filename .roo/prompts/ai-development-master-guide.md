# AI Development Master Guide — HomeBase & Family App Ecosystem

> **Purpose**: A single, comprehensive prompt that governs all AI-assisted development across HomeBase (family management), Memories (personal journal), and any future app. This guide is the canonical reference — every AI agent must read and follow it without exception.
>
> **File path**: `.roo/prompts/ai-development-master-guide.md`
>
> *Consolidated from: `Ai App Build Instructions.md`, `Ai Agent Guide.md`, `build-deploy-guide.md`, `all_modes.md`, `global.md`, `code.md`, `PROJECT_SUMMARY.md`, `Finance System Audit.txt`, codebase patterns.*

---

## Table of Contents

1. [Non-Negotiable Rules](#1-non-negotiable-rules)
2. [Pre-Development Protocol](#2-pre-development-protocol)
3. [Workflow & Process](#3-workflow--process)
4. [Docker / NAS Deployment](#4-docker--nas-deployment)
5. [Tech Stack Reference](#5-tech-stack-reference)
6. [Next.js Architecture Patterns](#6-nextjs-architecture-patterns)
7. [Database & Migrations](#7-database--migrations)
8. [Finance Module Architecture](#8-finance-module-architecture)
9. [UI / UX Conventions](#9-ui--ux-conventions)
10. [PWA Patterns](#10-pwa-patterns)
11. [Testing Protocol](#11-testing-protocol)
12. [Completion & Documentation](#12-completion--documentation)
13. [Common Pitfalls & Anti-Patterns](#13-common-pitfalls--anti-patterns)
14. [Debugging & Recovery](#14-debugging--recovery)
15. [Git & Version Control](#15-git--version-control)

---

## 1. Non-Negotiable Rules

### 1.1 GL-First Finance Architecture — ABSOLUTE

> **This rule is non-negotiable. Every AI agent must enforce it. Proposals that violate it must be flagged as invalid.**

All financial transactions — regardless of source, type, or module — **must be written to a single source of truth: the General Ledger (GL)**.

The system must behave like Xero in this respect: every financial entry (invoices, payments, bills, expenses, adjustments, journal entries) flows directly into and lives in the GL.

**Implementation requirements:**
- Every income receipt, bill payment, expense, and adjustment **must** create a posted `FinanceJournalEntry` with balanced debit/credit `FinanceJournalLine` records.
- The GL (`FinanceJournalLine` on posted entries) is the **only** source of truth for all financial reports: Trial Balance, P&L, Balance Sheet, Tax Report, and General Ledger.
- `FinanceTransaction` is a **cache/lookup convenience table** for the transactions page UI only — never the source of truth for reporting.
- All report routes must read from `FinanceJournalLine` (posted entries), not from `FinanceTransaction`, `FinanceRecurringBill`, or `FinanceIncomeEntry` tables.
- No off-ledger transactions, no temporary buckets that bypass the GL, no duplicate sources of truth.

**Enforcement:**
- If a suggestion or implementation violates this principle, flag it as **invalid** immediately.
- Do not propose alternatives that break this model.
- Any new finance feature must write GL journal entries as its primary data path.

### 1.2 Safe Phased Development — Checkpoints Required

**Every task must proceed in phases with explicit checkpoints.** Do not implement everything in one shot. The workflow is:

1. **Investigate Phase** — Read all relevant files, understand the codebase, present findings.
2. **Plan Phase** — Present an implementation plan with specific files, risks, and Docker impact. **Wait for approval.**
3. **Implement Phase** — Execute the approved plan in logical sub-steps, with checkpoints between major blocks.
4. **Verify Phase** — Run build, tests, and linter.

At each checkpoint, present a brief summary of what was done and what's next. Ask "Proceed to the next phase?" before continuing.

Tool call targets per phase (not per task):
| Phase | Target Tool Calls |
|-------|-------------------|
| Investigate | 2–4 (read_file, search_files) |
| Plan | 1 (state the plan, wait for approval) |
| Implement | 3–6 per checkpoint block |
| Verify | 1–2 (execute_command for build/test) |

### 1.3 Build Environment

**Built on Windows → Deployed as Docker on Synology NAS.** Every feature plan must explicitly address Docker impact:
- `Dockerfile`, `docker-compose.yml`, and entrypoint script must be updated if the feature requires infrastructure changes.
- All three files must be updated together and the user prompted to copy them to the NAS.
- The user commits manually when a task is finished — do **not** use git for intermediate updates.
- All file updates happen in the correct directory (`C:\Appdev\*appname*`).

### 1.4 Data Persistence

Data lives outside containers by default:
- Use host-mounted volumes for files.
- Use persistent databases with external storage (`/data` on the NAS).
- The `DATA_PATH` environment variable controls database location.

---

## 2. Pre-Development Protocol

### 2.1 Codebase Audit Checklist

Before *any* implementation, perform these checks in one parallel batch:

```
[ ] Folder structure — entry points, existing components, routes, data models
[ ] Dependencies — read package.json
[ ] Environment — check .env.example for env vars in use
[ ] Coding style — linting config (ESLint), formatter (Prettier), naming conventions
[ ] Docker files — Dockerfile, docker-compose.yml, docker/entrypoint.sh
[ ] Next.js version — read node_modules/next/dist/docs/ for breaking changes
[ ] Git state — note current branch, uncommitted changes, current image tag
[ ] Prisma schema — check latest schema.prisma for model changes
[ ] AGENTS.md / CLAUDE.md — read project-level agent instructions
[ ] QA.md — read regression prevention guide; mandatory before any finance change
[ ] .rooignore — respect file access restrictions
```

### 2.2 Design Before Building — MUST Wait for Approval

1. **Summarise** what already exists relevant to the task.
2. **Propose** an implementation plan listing **specific files** to create or modify.
3. **Explicitly state** Docker impact: layer caching, image size, volume mounts, entrypoint changes.
4. **State the plan** in max 5 bullet points — then **STOP and wait for user approval** before implementing.
5. **Do not proceed** until the plan is approved. The user may request changes.

---

## 3. Workflow & Process

### 3.1 Phased Development — Checkpoints Between Phases

Every task follows a structured phase gate process:

```
[Read & Investigate] → [Present Plan] → [Wait for Approval] → [Implement Block 1] → [Checkpoint] → [Implement Block 2] → [Checkpoint] → ... → [Verify & Complete]
```

#### Phase 1: Investigate
- Read ALL relevant files in **one parallel batch** of `read_file` calls.
- Understand the codebase, dependencies, and side effects.
- Present a structured summary: what exists, what needs to change, risks.

#### Phase 2: Plan (requires approval)
- Present the implementation plan in max 5 bullet points.
- List **specific files** to create or modify.
- State Docker impact clearly.
- **Stop and wait for approval.** Do not proceed until the user says "go ahead" or "approved".

#### Phase 3: Implement (with checkpoints)
- Break implementation into **logical blocks** (e.g. "schema + migration", "API routes", "client components").
- Implement one block at a time.
- After each block, present a brief summary and ask: **"Block X complete. Proceed to Block Y?"**
- Wait for confirmation between blocks.

#### Phase 4: Verify
- Run build, tests, linter at the end.
- Only call `attempt_completion` when all blocks are done AND verified.

### 3.2 Checkpoints Are REQUIRED — Not Optional

- **Always** ask before moving between major work blocks.
- Present intermediate results for feedback — do not hide progress until the end.
- Acceptable checkpoint questions:
  - "Schema and migration complete. Proceed to API routes?"
  - "API routes tested. Proceed to client components?"
  - "UI implemented. Proceed to final verification?"
- Do not call `attempt_completion` until the ENTIRE task is done and verified.

### 3.3 Tool Call Batching Rules

Batch aggressively within each checkpoint block. Aim for:

| Operation | Rule |
|-----------|------|
| `read_file` | All files in one parallel batch per investigate/read step. |
| `apply_diff` | Minimum 3–5 SEARCH/REPLACE blocks per call. Target 1–3 apply_diff calls per checkpoint block. |
| `execute_command` | Max 2–3 commands per checkpoint block. Chain with `&&` when possible. |
| `search_files` | Only if you cannot find what you need via `read_file`. |

### 3.4 Self-Healing on Tool Failures

- If `apply_diff` SEARCH fails: **immediately re-read the file** and retry with exact content. Never expose the error to the user.
- If a build fails: read the error, fix the issue, rebuild. Never ask "what should I do?".
- The user should never see tool errors. Every failure must be silently recovered.

### 3.5 General Development Rules

- **No regressions** — verify existing functionality remains intact.
- **Only modify files directly related to the task** — do not refactor unrelated code.
- Ensure **backward compatibility** for functions, APIs, and data schemas.
- Match the project's existing **error handling patterns** (try/catch, toast notifications, logging).
- **Do not hardcode secrets or API keys** — use environment variables and `.env` files.
- Before adding a new dependency, check if an existing library already covers the need.
- Keep it simple and focused — do not overthink or go down rabbit holes.
- When updating/editing files, use the correct directory in `C:\appdev\*appname*`.

### 3.6 Sub-Agent Workflow (Large Tasks)

For large tasks requiring parallel work:
- Each sub-agent must **check back** before merging output into the main codebase.
- Each sub-agent must document their Docker-related changes.
- Sub-agents must run tests and confirm their module is working before reporting complete.
- The orchestrating agent performs a final **integration test** after all sub-agents finish.
- Do not use git for intermediate updates — user commits manually when finished.
- Update all relevant worktrees when finished.

### 3.7 Report, Don't Fix — Out-of-Scope Discoveries

When you uncover a bug, smell, or improvement that is **outside the scope of the current task**, the default is to **report it, not fix it.** Do not silently expand the diff. This protects the original task (it keeps attention and context budget on what was asked) and keeps every change attributable (if the task's diff regresses something, it should contain one intent, not opportunistic side-fixes). This is the same instinct as §3.5 "only modify files directly related to the task," applied to every kind of discovery.

**On discovery, do this instead of fixing:**
1. **Stop and surface it** — don't work past it silently.
2. **Document it thoroughly, now, while the context is loaded.** This is the most important step. A deferred find is only safe if a future reader (you, another agent, or the user) can act on it cold, without re-deriving everything. The cheap thing to lose later is *what to change*; the expensive thing is *why the code is shaped this way and what breaks if you touch it*. A one-line "fix X later" is a trap, not a deferral.
3. **Propose where to log it** (follow-up task, a `QA.md` §12 bug-pattern entry, or an audit-prompt sweep) and let the user triage.
4. **Wait for confirmation before fixing.**

**A deferred-issue report must contain — do not abbreviate:**
- **Location** — file(s), function/component, and line references. List *every* site if more than one (see instance-vs-class below).
- **Symptom** — what's wrong and how it manifests (or would manifest) to the user / to the GL / to data integrity.
- **Why the code is currently like this** — the constraint, history, or assumption that explains the present shape. This is the context that evaporates; write it down even if it feels obvious today.
- **Failure modes of the naïve fix** — what a careless change would break, what semantics must be preserved, what to test afterward. Name the specific invariant or smoke test (e.g. "must keep DR=CR", "re-run J1–J7", "preserve retry-on-conflict").
- **Blast radius** — what else imports/depends on the affected code (cross-reference `QA.md` §9 for finance, §1.1 otherwise).
- **Suggested fix direction** — enough of a sketch that the work can start without rediscovery, explicitly marked as a proposal, not a decision.
- **Severity / urgency** — so the user can triage queue position (live data damage vs. cosmetic).

Write the report as if the reader has none of your current context, because they won't. If it's worth a code change later, it's worth a paragraph now.

**Instance vs. class — the most important call at discovery.** Ask: *could this same issue exist elsewhere?* If yes, fixing only the instance in front of you is **actively harmful** — it creates a fixed-here / silently-broken-there divergence, which is worse than a consistently-wrong codebase you can sweep in one pass (this is the `QA.md` §12.7 "fix one instance, miss others" pattern). A class-level discovery must become a dedicated sweep task (and the report must enumerate every known site), never an inline fix.

**The only exceptions — address now, but still isolate and document:**
- Completing the current task **genuinely requires** the fix (it cannot land correctly without it), or
- The issue is **live damage to real data** (especially finance/GL).

In both cases, make the fix, but give it its **own logical change / commit**, note the coupling to the original task in the commit message, and still write the find up (in the commit body, or `QA.md` §12 if it's a new recurring pattern). "Required to proceed" is not a licence to blur two changes into one unattributable diff, nor to skip documentation.

---

## 4. Docker / NAS Deployment

### 4.1 Core Principle

**Build on Windows → Deploy on Synology NAS.** Every feature plan and implementation must explicitly address Docker impact.

### 4.2 Dockerfile Pattern (4-Stage Build)

```
── deps     — install ALL dependencies (npm ci --production=false)
── builder  — build the Next.js app (npm run build)
── pruner   — install clean production-only deps, copy built app
── runner   — minimal production image (node:20-alpine), non-root user
```

Key points:
- **Pruner stage** eliminates need to manually enumerate `serverExternalPackages`.
- Keep good comments on each layer's purpose.
- Use `node:20-alpine` as base image.
- Create and use a non-root user in the runner stage.
- Multi-platform awareness (amd64/arm64 for NAS devices).

### 4.3 docker-compose.yml Requirements

- **Healthcheck**: Poll `/api/health` every 30s (`interval: 30s`, `timeout: 10s`, `retries: 3`).
- **Annotated volume mounts**: Comment each volume with its purpose.
- **Environment variables**: Listed above volumes for readability.
- **Restart policy**: `unless-stopped`.
- **Volume mounts**: `/data` for database, uploads, persistent state. App code is baked into the image (not mounted as a volume in production).

### 4.4 Entrypoint Script Pattern

Structure the entrypoint as numbered steps:
1. **Environment validation** — check required env vars exist.
2. **Data directory setup** — create `/data` sub-directories (backups, uploads, etc.).
3. **Database migration** — `npx prisma migrate deploy` with fallback to `db push`.
4. **Daily backup cron** — schedule via `su-exec` as the `nextjs` user.
5. **Database health check** — verify using `sqlite3` CLI or DB-specific client.
6. **Start application** — `exec node server.js`.

Critical patterns:
- Pre-migration backups written to `/data/backups/` (not root `/data/`).
- Strict migration error handling — exit cleanly with diagnostics.
- Script remains executable after modifications (`chmod +x`).
- Windows line endings (CRLF) vs Linux (LF) — entrypoint must remain LF.

### 4.5 Build & Deploy Flow

```bash
# Step 1: Build Docker image (Windows)
deploy-build.bat
# Does: docker build --no-cache → docker save → SCP to NAS

# Step 2: Deploy on NAS
ssh admin@sovereign-main
sudo sh /volume1/docker/homebase/deploy-nas.sh

# Step 3: Migrations auto-apply on container start
# entrypoint.sh runs: npx prisma migrate deploy
```

### 4.6 SQLite Compatibility Warning

SQLite does NOT support `ALTER TABLE ... ADD COLUMN ... UNIQUE`. If a migration needs a unique column, split it into:

```sql
ALTER TABLE "TableName" ADD COLUMN "columnName" TEXT;
CREATE UNIQUE INDEX "TableName_columnName_key" ON "TableName"("columnName");
```

### 4.7 Rollback

The entrypoint auto-creates a pre-migration backup before running migrations:
```
/data/backups/homebase.db.pre-deploy.YYYYMMDD_HHMMSS
```

To restore manually on the NAS:
```bash
cp /data/backups/homebase.db.pre-deploy.<timestamp> /data/homebase.db
```

Keep previous Docker image tagged for `docker compose up --no-build` rollback.

### 4.8 Migration Workflow

1. Create a numbered folder: `prisma/migrations/NNNN_description/migration.sql`.
2. The migration runs automatically on next Docker deploy via the entrypoint.
3. For dev: `npx prisma migrate dev` (creates migration file automatically).
4. **Always remind the user** to rebuild and redeploy after Prisma schema changes.

---

## 5. Tech Stack Reference

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js (App Router) + TypeScript | Check `node_modules/next/dist/docs/` for version-specific breaking changes |
| **React** | React 18 (Server Components, Client Components) | |
| **Auth** | NextAuth.js v4 | Google OAuth (Memories), Credentials Provider (HomeBase) |
| **Database** | SQLite via Prisma ORM (better-sqlite3) | Single file, location controlled by `DATA_PATH` env var |
| **UI** | Tailwind CSS + shadcn/ui (HomeBase) | Lucide React icons; **Luxon** for dates/timezones (date-fns retired) |
| **Forms** | react-hook-form + zod | Form validation |
| **Drag & Drop** | @dnd-kit | Lists, reordering |
| **Icons** | Lucide React | |
| **Dates** | **Luxon** (`DateTime` with explicit zone) | Date manipulation and timezone handling. Wrapped by `src/lib/timezone.ts` helpers — app code calls the helpers, never Luxon/`Date` directly. date-fns is retired. See AGENTS.md §Timezone and QA.md §12.20 |

### Styling Conventions
- Avoid raw hex colours in className — use design system tokens.
- Responsive design: mobile `< 640px` | Tablet/Desktop `sm+`.
- Dynamic dark/light/auto switching (Apple themes available).

### Key Infrastructure Files
- `Dockerfile` — 4-stage build
- `docker-compose.yml` — container orchestration
- `docker/entrypoint.sh` — startup script
- `deploy-build.bat` — Windows build script
- `deploy-nas.sh` — NAS deployment script

---

## 6. Next.js Architecture Patterns

### 6.1 App Router Pattern (Consistent Across All Features)

```
page.tsx      →  Server Component: calls requireSession(), fetches initial data via Prisma
*Client.tsx   →  Client Component: interactivity, API route calls for mutations
route.ts      →  API Route: guarded by requireSession(), CRUD operations
```

### 6.2 Server Page Pattern

```typescript
// page.tsx
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ClientComponent from './ClientComponent'

export default async function Page() {
  const session = await requireSession()
  const data = await prisma.model.findMany({
    where: { familyId: session.user.familyId },
  })
  return <ClientComponent data={data} />
}
```

### 6.3 Client Component Pattern

- Imported by the server page.
- Receives initial data as props.
- Calls API routes (`fetch('/api/...')`) for all mutations.
- Manages local state with React hooks (useState, useCallback, useEffect).
- Handles loading, error, empty, and success states.

### 6.4 API Route Pattern

```typescript
// route.ts
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await requireSession()
  const data = await prisma.model.findMany({ ... })
  return NextResponse.json(data)
}
```

### 6.5 Route Structure Convention

```
src/app/(app)/                    — authenticated routes (layout group)
  feature-name/
    page.tsx                      — server component page
    FeatureClient.tsx             — client component
    api/
      feature-name/
        route.ts                  — GET (list), POST (create)
        [id]/
          route.ts                — GET, PATCH, DELETE
          nested-action/
            route.ts              — e.g. complete, rotate, reorder
```

### 6.6 Settings-First Architecture

User preferences are stored in the database, not hardcoded:
- **JSON columns** on the `User` model for flexible config.
- **Boolean columns** for simple on/off toggles.
- Settings flow: `SettingToggle` → `PATCH /api/settings` → database → `GET /api/settings` → consumer component checks the pref.
- **Critical**: When adding a new setting, ensure the consumer component actually checks the setting value before rendering.

### 6.7 Next.js Version Awareness

**This is critical.** Each new version may have breaking changes in APIs, conventions, and file structure. Before writing any code:
1. Read `AGENTS.md` / `CLAUDE.md` in the project root.
2. Check `node_modules/next/dist/docs/` for version-specific guides.
3. Heed deprecation notices.

### 6.8 Separation of Concerns — Keep Pages Thin

**Core Rule:** Business logic, handlers, and utility functions MUST be separated from UI page components.

#### Page Component Constraints

- **MUST NOT** contain event handlers, API calls, state management logic, or helper functions defined inline.
- **Maximum 50 lines** per page component (excluding imports and whitespace).
- Page components should only:
  - Render JSX/TSX markup.
  - Import and call functions from appropriate modules.
  - Handle minimal, page-specific local state (e.g. dialog open/close, form input values).

#### Where Logic Should Live

| Logic Type | Location | Example |
|------------|----------|---------|
| Event handlers & workflows | `handlers/` or `hooks/` | `useSubmitForm`, `handleLogin` |
| API calls & external services | `services/` or `api/` | `fetchUserData`, `authService` |
| Pure helper functions | `utils/` or `helpers/` | `formatDate`, `validateEmail` |
| Shared state | `store/` or `context/` | Redux slices, Zustand stores |
| Custom reusable logic | `hooks/` | `useDebounce`, `useLocalStorage` |

#### File Structure Example

```
src/
├── pages/         # UI only (thin components)
├── handlers/      # Business logic & event handlers
├── services/      # API & external services
├── utils/         # Pure helper functions
├── hooks/         # Reusable custom hooks
└── store/         # State management
```

#### ✅ Correct Pattern

```typescript
// handlers/dashboardHandlers.ts
import { submitForm } from '@/services/apiService'

export const useDashboardHandlers = () => {
  const handleSubmit = async (formData: FormData) => {
    const result = await submitForm('/api/submit', formData)
    localStorage.setItem('lastSubmit', Date.now().toString())
    return result
  }
  return { handleSubmit }
}

// utils/dateHelpers.ts
export const formatDate = (date: Date): string => {
  return new Date(date).toLocaleDateString()
}

// pages/Dashboard.tsx — CLEAN UI ONLY
import { useDashboardHandlers } from '@/handlers/dashboardHandlers'
import { formatDate } from '@/utils/dateHelpers'

export default function Dashboard() {
  const { handleSubmit } = useDashboardHandlers()
  return <form onSubmit={handleSubmit}>...</form>
}
```

#### ❌ Anti-Pattern (Don't Do This)

```typescript
// pages/Dashboard.tsx — BAD
export default function Dashboard() {
  const [data, setData] = useState(null)
  
  // Handler logic inline — BAD
  const handleSubmit = async (formData) => {
    try {
      const response = await fetch('/api/submit', { method: 'POST', body: JSON.stringify(formData) })
      const result = await response.json()
      setData(result)
      localStorage.setItem('lastSubmit', Date.now())
    } catch (error) { console.error(error) }
  }
  
  // Utility function inline — BAD
  const formatDate = (date) => new Date(date).toLocaleDateString()
  
  return <form onSubmit={handleSubmit}>...</form>
}
```

#### Benefits

| Benefit | Why |
|---------|-----|
| ✅ **Code Reusability** | Same handler works across multiple pages |
| ✅ **Easier Debugging** | Logic is centralised, not scattered across pages |
| ✅ **Simpler Testing** | Test handlers and utilities independently from UI |
| ✅ **Reduced Duplication** | No copy-pasting logic between pages |
| ✅ **Better Maintainability** | Change logic in one place, not every page |
| ✅ **Cleaner Code Reviews** | PRs show actual changes, not duplicate code |

#### Enforcement Checklist

During implementation and code review, verify:

- [ ] No API calls directly in page components
- [ ] No complex handlers defined inside pages
- [ ] No utility functions defined in pages
- [ ] No `localStorage`/`sessionStorage` directly in pages
- [ ] Any function used in 2+ places is extracted to a shared module
- [ ] Page components are under 50 lines (excluding imports)

#### Refactoring Existing Code

When you find violations:

1. **Identify** the logic type (handler, utility, API call).
2. **Create** an appropriate file in the correct directory (`handlers/`, `utils/`, `services/`, `hooks/`).
3. **Move** the logic there.
4. **Update** imports in the page component.
5. **Test** that functionality remains unchanged.

#### Self-Check Questions

Before writing code in a page component, ask:

- Can this logic be reused elsewhere? → **Extract it**
- Does this need to be tested separately from the UI? → **Extract it**
- Is this more than 10 lines of non-JSX code? → **Extract it**
- Would this logic work the same in a different framework? → **Extract it**

---

## 7. Database & Migrations

### 7.1 Schema Patterns

- **Common models**: `User` with JSON columns for preferences, family-scoped models (`familyId`), user-scoped models (`userId`).
- **Prisma conventions**:
  - `@id @default(cuid())` for primary keys.
  - `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`.
  - `@relation` with `onDelete: Cascade` for dependent records.
  - Proper indexes on foreign keys and frequently-queried columns.
  - `@@unique` constraints where needed.
  - JSON fields typed as `Json` in Prisma, cast in application code.

### 7.2 Migration Workflow

1. Create a numbered folder: `prisma/migrations/NNNN_description/migration.sql`.
2. The migration runs automatically on next Docker deploy via the entrypoint.
3. For dev: `npx prisma migrate dev`.
4. **Always remind user** to rebuild & redeploy after schema changes.

### 7.3 SQLite Considerations

- Single file database — `DATA_PATH` env var controls location.
- No concurrent write scaling (fine for single-NAS deployment).
- Backup strategy: entrypoint creates daily backups to `/data/backups/`.
- Use SQLite-specific functions where needed (e.g. `$contains` for string matching).
- **Unique column limitation**: Use separate `CREATE UNIQUE INDEX` instead of `ALTER TABLE ... ADD COLUMN ... UNIQUE`.

### 7.4 JSON Columns vs Boolean Columns

| Type | When to Use | Example |
|------|-------------|---------|
| **JSON column** | Flexible config, multiple sub-fields, third-party service config | `garminConfig: { dataStartDate, cardMetrics, metricsStyle }` |
| **Boolean column** | Simple on/off toggle | `showWritingPrompts: Boolean`, `weekStartsOn: Int` |

---

## 8. Finance Module Architecture

### 8.1 Core Data Model (GL-First)

```
FinanceJournalEntry          — The single source of truth. Every journal entry.
  ├── isPosted: Boolean      — Only posted entries appear in reports.
  ├── type: String           — manual | adjustment | reversal | opening_balance | auto_transaction
  ├── date: DateTime         — The economic date of the entry.
  ├── reference: String?     — Auto-assigned (JE-0001 format).
  └── lines: FinanceJournalLine[]
        ├── glAccountId      — FK → FinanceCategory (the GL account).
        ├── side             — 'debit' | 'credit'
        ├── amount: Float
        └── memberId: String? — FK → User (for per-person tracking)

FinanceTransaction           — CACHE/LOOKUP table for the Transactions page UI only.
FinanceCategory              — The Chart of Accounts / GL accounts.
  ├── type: String           — income | expense | asset | liability | equity | transfer
  ├── glCode: String?        — Chart of Accounts numbering (e.g. "1001")
  ├── openingBalance: Float? — Starting balance for asset/liability/equity accounts.
  ├── openingBalanceDate: DateTime?
  └── taxIncludeInReporting: Boolean

FinanceRecurringBill         — Bill/recurring expense tracking.
  └── journalEntryId: String? — Link to the GL journal entry.

FinanceIncomeEntry           — Income tracking.
  └── journalEntryId: String? — Link to the GL journal entry.
```

### 8.2 GL Posting Rules

| Event | GL Entry | Source |
|-------|----------|--------|
| Bill invoice received | DR Expense / CR Accounts Payable | `postBillToGL()` in bills route |
| Bill paid | DR AP / CR Bank | `postBillPaymentToGL()` in bills route |
| Income remittance received | DR AR / CR Income | Income route Stage 1 |
| Income cash received | DR Bank / CR AR | Income route Stage 2 |
| Manual journal | User-specified DR/CR lines | Journals API route |
| Opening balance | DR Asset / CR Opening Balances equity | `finance-opening-balance.ts` |
| Transfer | DR Account A / CR Account B | Via transaction form with `isTransfer=true` |

### 8.3 Report Data Flow

| Report | Data Source | Notes |
|--------|-------------|-------|
| Trial Balance | `FinanceJournalLine` (posted) | Debits must equal credits |
| P&L | `FinanceJournalLine` (posted, income/expense accounts) | GL-only — no bill/income table reads |
| Balance Sheet | Bank balances (cleared `FinanceTransaction`) + COA opening balances + GL journal lines | Hybrid approach |
| Tax Report | Tax-tracked income entries + transactions with tax classifications | Per-person + entity sections |
| General Ledger | `FinanceJournalLine` (posted, per account) | Single account drill-down |
| Annual P&L | Bills + income + transactions for the FY | 12-column Jul–Jun table |

### 8.4 Tax Classification Values

| Record Type | Valid Values |
|-------------|-------------|
| `FinanceTransaction` (expense/transfer) | `tax_deduction`, `tax_payment`, null |
| `FinanceTransaction` (income) | `taxable_income`, `exempt_income`, null |
| `FinanceRecurringBill` | `tax_deduction`, `tax_payment`, null |
| `FinanceIncomeEntry` | `taxable_income`, `exempt_income`, null |

### 8.5 Key Design Decisions

- **Tax brackets in page component, not API**: `calcIncomeTax()`, `calcMedicare()`, `SUPER_CAP` live in `tax-report/page.tsx`. Update one file each July, no redeployment needed.
- **isTransfer = false filter on P&L**: transfers excluded from all income/expense totals.
- **Joint income split**: income entries with no `memberId` are split equally across all family members in the Tax Report.
- **Entity type → tax rate**: `superfund` → 15%, `business`/`trust` → 30%, others → individual brackets.
- **taxClassification always optional**: removed from all `validate()` functions. None block saving if unset.
- **Balance Sheet hybrid**: bank balances from cleared transactions, COA opening balances from `FinanceCategory` records.

---

## 9. UI / UX Conventions

### 9.1 State Handling

Every async operation must handle four states:
- **Loading**: spinner, skeleton, or progress indicator.
- **Error**: meaningful error message with retry action where possible.
- **Empty**: helpful empty state ("No items found" with action button).
- **Success**: confirm with toast notification (use `sonner` or similar library).

**Anti-pattern**: Showing "Empty" state when the actual issue is a server error.

### 9.2 Responsive Design

- Mobile-first with Tailwind breakpoints.
- Mobile nav FAB: `fixed bottom-safe-4 right-4` (clears iPhone home indicator).
- Desktop sidebar: `fixed left-0 w-64` with collapse option.
- `globals.css` sets `overflow-x: hidden` on both `html` and `body` — **do not remove these**.

### 9.3 Mobile FABs — No Conflicts

The mobile nav FAB sits at `fixed right-4 bottom-safe-4 z-[70]`. Any other floating action button must use `hidden md:flex` to restrict to desktop only.

### 9.4 iPhone PWA Safe Area

```css
@layer utilities {
  .pb-safe { padding-bottom: max(1.25rem, env(safe-area-inset-bottom)); }
  .bottom-safe-4 { bottom: calc(1rem + env(safe-area-inset-bottom)); }
}
```

Layout export: `export const viewport = { viewportFit: 'cover' }`.

### 9.5 z-Index Ladder

| Level | z-index | Element |
|-------|---------|---------|
| Sidebar | `z-50` | Desktop navigation |
| Editor footer | `z-[60]` | Bottom action bars |
| Mobile nav FAB | `z-[70]` | Floating action button |
| Modals | `z-[80]` | Dialog overlays |
| Lightbox | `z-[90]` | Full-screen image viewer |
| Mobile nav sheet | `z-[10051]` | Slide-in navigation |

### 9.6 Deletion Confirmation

**Never delete without confirmation.** Use either:
- Browser `confirm()` dialog (simpler, adequate for most cases).
- A proper Dialog/Modal component (consistent with shadcn/ui pattern).

### 9.7 Accessibility

- New UI elements must include proper labels, ARIA attributes, and keyboard navigation support.
- Maintain sufficient colour contrast (WCAG AA minimum).
### 9.8 New UI Elements

- Must match the existing design system (components, spacing, typography, colours).
- Ensure the UI is updated so users can discover and use every feature you implement.

### 9.9 Dialogs & Editors — In-Place, Resizable Modals (Session State Preservation)

**All dialogs, forms, and editors must be in-place modals or sheets — never navigate away from the current page.**

Rationale:
- Navigating away destroys React component state, losing unsaved form data, scroll position, and UI state.
- In-place modals preserve session state, allowing the user to return to exactly where they were.

Rules:
1. **Create/Edit forms**: Always render in a dialog/modal overlay on the current page (use shadcn/ui `Dialog` or `Sheet` component).
2. **Detail views**: Use expandable panels, side sheets (`Sheet`), or inline expansion — never a separate page route.
3. **Dynamically resizable**: Modals should resize dynamically based on content. For complex forms, use a multi-step wizard within the modal, not page navigation.
4. **Common implementation pattern**:
   ```typescript
   // Use a URL query param or state toggle to open/close — never navigate to /feature/new
   const [dialogOpen, setDialogOpen] = useState(false)
   const [editId, setEditId] = useState<string | null>(null)
   
   // On the page, render:
   <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
     <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
       <CreateEditForm id={editId} onSuccess={() => { setDialogOpen(false); refresh() }} />
     </DialogContent>
   </Dialog>
   ```
5. **Avoid `router.push()` for CRUD operations** — only use page navigation for top-level feature switching, never for individual item create/edit/delete flows.
6. **Exception**: Only navigate to a dedicated page if the feature genuinely requires a full-page experience (e.g. a rich text journal editor, or a complex multi-tab report view). Even then, prefer a `Sheet` component that slides in from the side.


---

## 10. PWA Patterns

### 10.1 Install Prompt

- Skip if already installed (`display-mode: standalone` or `navigator.standalone`).
- Skip if previously dismissed (stored in `localStorage`).
- **"Later"** button snoozes for 7 days.
- **Firefox/Samsung Internet fallback**: if `beforeinstallprompt` doesn't fire within 5s, show manual guide.
- Positioned `bottom-[72px]` mobile, `bottom-6` desktop, centred at `z-[9999]`.
- **Prerequisite**: `public/manifest.json` must exist with valid PWA metadata.

### 10.2 Manifest Requirements

- `scope: "/"`, `display_override` with `window-controls-overlay`.
- Maskable icons required for Chrome on Android install prompt.
- `purpose: "maskable"` icons with safe zone (75% of canvas).

### 10.3 Service Worker

- `public/sw.js` — basic service worker for offline fallback.
- `public/offline.html` — offline fallback page.

### 10.4 Offline Editing Pattern (if applicable)

- IndexedDB stores for pending operations, offline entries, pending attachments, rollback snapshots.
- Sync flow: offline create (temp ID) → offline edit (deduplicated) → reconnect → process queue → ID resolution → URL fix.
- Attachment retries: max 3 failures, then permanent removal.
- Rollback snapshots expire after 48 hours.

---

## 11. Testing Protocol

### 11.1 Requirements

- Test all new code paths, including edge cases.
- **Test for existing users** — no breaking changes to current workflows or data.
- Run the project's linter and formatter before finishing (ESLint, Prettier).
- Confirm the build succeeds with no errors or warnings.

### 11.2 Environment Matrix

| Environment | How to Test |
|-------------|-------------|
| **Dev (Windows native)** | `npm run dev` |
| **Docker dev (Windows)** | `docker compose up -d` |
| **Production (NAS)** | Build image, SCP, deploy via `deploy-nas.sh` |

### 11.3 Docker-Specific Tests

- Build image: `docker compose build`.
- Start services: `docker compose up -d`.
- Verify container health checks pass.
- Test volume persistence across container restarts.
- Check network connectivity between containers.
- Verify environment variable injection.
- Test with Windows line endings (CRLF) vs Linux (LF) in mounted files.

### 11.4 Finance-Specific Tests

> **See `QA.md` §2–§6 for the complete accounting invariants, full lifecycle flows, and all named smoke tests (B1–B9, I1–I8, J1–J7, T1–T6, R1–R8). The checklist below is a minimum bar; QA.md is authoritative.**

- Verify each transaction: total debits = total credits (down to 0.001 precision).
- Verify Trial Balance: total debits = total credits.
- Verify Balance Sheet: Assets = Liabilities + Equity.
- Verify P&L: Revenue - Expenses = Net Income.
- Verify payslip entries: grossPay = netPay + paygWithheld + sgcAmount.
- Verify payslip journal: sum(DR lines) = grossPay = sum(CR lines).
- Test timezone handling across DST boundaries (Oct & Apr in Australia).
- Test date range filters on all reports.
- After any change to `finance-posting.ts`, `finance-draft-spawn-service.ts`, or `finance-draft-approval-service.ts`: run the full bill and income lifecycle smoke tests.

---

## 12. Completion & Documentation

### 12.1 Completion Checklist

```
[ ] Linter and formatter passing
[ ] No unintended files modified
[ ] Docker image builds without warnings
[ ] Container health checks pass
[ ] Database migrations run successfully
[ ] New env vars documented in .env.example
[ ] README.md updated if build steps changed
[ ] Summary doc created in /docs with:
    - Implementation details
    - Docker build instructions
    - Environment variables added
    - Testing results
    - Rollback procedure
[ ] Build/deploy reminder added to completion message (if schema changed)
[ ] Separation of Concerns verified:
    - Page components under 50 lines (excluding imports/whitespace)
    - No handlers/API calls/utility functions defined inline in pages
    - Any repeated logic extracted to shared module
```

### 12.2 Completion Message

Use `attempt_completion` with a clear summary of:
- What was implemented.
- Files created or modified.
- How to test the new functionality.
- Any known limitations or follow-up recommendations.
- **Deploy reminder** (if Prisma migrations were added):
  > **Deploy reminder:** This change includes new Prisma migrations. You'll need to run `deploy-build.bat` and then `sudo sh /volume1/docker/homebase/deploy-nas.sh` on the NAS for the migration to apply to production.

### 12.3 Summary Document

Create a summary Markdown file and save it to the `/docs` directory with:
- Implementation details.
- Docker build instructions.
- Environment variables added.
- Testing results.
- Rollback procedure.

---

## 13. Common Pitfalls & Anti-Patterns

### 13.1 Copy-Paste Bugs in Date Calculations
**Problem**: Hardcoded values, duplicated date logic across multiple locations; treating UTC as local time.
**Fix**: Use the Luxon-backed `src/lib/timezone.ts` helpers (`todayBoundsInTz`, `nDaysFromTodayInTz`, `monthBoundsInTz`, `formatInTz`) — never `date-fns`, raw `Date` math, or `new Date('…T00:00:00Z')` as a day boundary. Always pass the user's timezone as a parameter. See AGENTS.md §Timezone and QA.md §12.20.

### 13.2 API Shape Assumptions
**Problem**: Client code assumes a specific response shape from the API.
**Fix**: Verify API response shape matches client expectations, or add defensive checks / TypeScript type validation.

### 13.3 Missing Error States
**Problem**: Server error results in misleading UI (empty state instead of error message).
**Fix**: Add a `fetchError` state separate from `loading` — show error panel with "Try again" on failure.

### 13.4 Settings Saved But Not Checked
**Problem**: A setting is saved to the database but the consumer component never checks it.
**Fix**: When adding a new toggle setting, explicitly verify the consumer component checks the value.

### 13.5 Missing Delete Confirmations
**Problem**: Destructive actions without confirmation.
**Fix**: Every delete action must have confirmation — either browser `confirm()` or a proper Dialog component.

### 13.6 Invalid POST Bodies
**Problem**: API rejects a request because required fields are missing from the POST body.
**Fix**: Ensure POST bodies match the API's validation expectations.

### 13.7 Type Casts vs Proper Typing
**Problem**: Using `as` type assertions to suppress TypeScript errors.
**Fix**: Fix the type definitions or the prop interface rather than resorting to type casts.

### 13.8 Optimistic Updates Without Error Revert
**Problem**: Optimistic UI updates that succeed visually but don't revert if the API call fails.
**Fix**: Either implement proper rollback on error, or skip optimistic updates and use loading states.

### 13.9 Finance: Reading FinanceTransaction Instead of GL
**Problem**: Reports read from `FinanceTransaction` table instead of posted `FinanceJournalLine` entries, causing double-counting or stale data.
**Fix**: All financial reports must read from `FinanceJournalLine` (posted entries). `FinanceTransaction` is a UI cache only.

### 13.10 Inline Business Logic in Page Components

**Problem**: Event handlers, API calls, and utility functions defined directly inside a page component, violating separation of concerns.

**Fix**: Extract to the appropriate module — handlers into `handlers/`, API calls into `services/`, utilities into `utils/`, custom logic into `hooks/`. Import and call from the page component instead.

**Enforcement**: Page components must stay under 50 lines (excluding imports/whitespace). If a page exceeds this, look for logic that should be extracted.

---

## 14. Debugging & Recovery

### 14.1 Prisma Studio

```bash
npx prisma studio          # Open database GUI in browser
docker compose exec app npx prisma studio
```

### 14.2 Migration Verification

```bash
npx prisma migrate status
docker compose exec app npx prisma migrate status
```

### 14.3 Container Health Checks

The healthcheck endpoint (`/api/health`) should:
- Return 200 if the app is running and database is reachable.
- Be polled every 30s by Docker.
- Fail after 3 retries, triggering container restart via `restart: unless-stopped`.

### 14.4 Log Management

- Application logs via `console.log` / `console.error` — captured by Docker.
- Never log or expose sensitive data.

### 14.5 Database Backup & Restore

**Backup** (runs daily via cron in entrypoint):
```bash
cp /data/database.sqlite /data/backups/database-$(date +%Y%m%d-%H%M%S).sqlite
```

**Restore**:
```bash
docker compose down
cp /data/backups/database-YYYYMMDD-HHMMSS.sqlite /data/database.sqlite
docker compose up -d
```

### 14.6 Quick Diagnostic Commands

```bash
docker compose exec app npx prisma migrate status
docker compose exec app npx prisma studio
docker compose ps
docker compose logs app --tail 100
docker compose exec app sqlite3 /data/database.sqlite "SELECT * FROM User;"
```

### 14.7 Rollback & Recovery

- Before starting, note the current state of any files to modify (including Docker files).
- Document current image tag/version for rollback reference.
- If something breaks in production, document what to revert.
- **Prefer feature flags** for large or risky changes so they can be toggled off without a deploy.
- **Docker rollback**: Keep previous image tagged, use `docker compose up --no-build`.
- Have `docker-compose.yml` backup ready.

---

## 15. Git & Version Control

### 15.1 Commit Guidelines

- Use descriptive commit messages explaining **what** and **why**.
- Do not mix unrelated changes in a single commit.
- **Do not use git for intermediate updates** — user commits manually when task is finished.
- Update all relevant worktrees when finished.
- Note which files were changed and why in the completion summary.

### 15.2 Docker File Commit Rules

- Commit `Dockerfile`, `docker-compose.yml`, and entrypoint script together when modified.
- Document breaking changes in commit message (e.g. environment variable removals).
- Tag commits that change Docker configuration.

### 15.3 Rollback References

- Before starting any task, note current state of files to modify.
- Document current image tag/version for rollback reference.
- Keep previous Docker image tagged for `docker compose up --no-build` rollback.

---

## Appendix A: Project Reference

### HomeBase (Family Management)
- **Tech**: Next.js (latest), NextAuth v4 (Credentials), SQLite + Prisma, shadcn/ui
- **Domain**: Recipes, meal plans, shopping lists, chores, contacts, notes, documents, calendar, events, finance
- **Deploy**: Docker → Synology NAS (`sovereign-main`)
- **Port**: 3000
- **Dev URL**: `http://localhost:3300`

### Memories (Personal Journal)
- **Tech**: Next.js 14, NextAuth v4 (Google OAuth), SQLite + Prisma, Tiptap 2, Leaflet
- **Domain**: Journal entries, rich text, Google Drive media, health data (Garmin/Fitbit/Withings)
- **Deploy**: Docker → Synology NAS
- **Port**: 3000

### Key File Locations
| File | Purpose |
|------|---------|
| `.roo/prompts/build-deploy-guide.md` | Build & deploy reference |
| `.roo/prompts/global.md` | Global development preferences |
| `.roo/prompts/all_modes.md` | Cross-mode behavior rules |
| `.roo/prompts/ai-development-master-guide.md` | **This file** — master reference |
| `QA.md` | **Regression prevention, finance accounting invariants, smoke tests, accountant checklist** |
| `AGENTS.md` | Form field safety rules + pointer to QA.md |
| `PROJECT_SUMMARY.md` | Current build state and finance module reference |
| `prisma/schema.prisma` | Full database schema |
| `docs/Chart of Accounts.txt` | COA design notes |
| `docs/Finance System Audit.txt` | Finance audit protocol |
| `docker/entrypoint.sh` | Container startup script |

---

*Compiled from: `Ai Agent Guide.md`, `Ai App Build Instructions.md`, `build-deploy-guide.md`, `all_modes.md`, `global.md`, `code.md`, `PROJECT_SUMMARY.md`, `Finance System Audit.txt`, `Chart of Accounts.txt`, and codebase analysis — May 2026*
