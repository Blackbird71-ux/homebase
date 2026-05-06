# AI Agent Guide — Full Stack App Building with Docker & NAS Deployment

## Overview

This guide consolidates everything learned from building **Memories** (personal journal) and **HomeBase** (family management) — two Next.js apps built on Windows, deployed as Docker containers on a Synology NAS. Use this as the canonical reference for all future app builds, feature additions, and maintenance.

---

## Table of Contents

1. [Workflow & Process](#1-workflow--process)
2. [Docker / NAS Deployment](#2-docker--nas-deployment)
3. [Next.js Architecture Patterns](#3-nextjs-architecture-patterns)
4. [Tech Stack](#4-tech-stack)
5. [Database & Migrations](#5-database--migrations)
6. [UI / UX Conventions](#6-ui--ux-conventions)
7. [PWA Patterns](#7-pwa-patterns)
8. [Health Data Integration Patterns](#8-health-data-integration-patterns)
9. [Common Pitfalls & Anti-Patterns](#9-common-pitfalls--anti-patterns)
10. [Feature Implementation Blueprints](#10-feature-implementation-blueprints)
11. [Debugging & Recovery](#11-debugging--recovery)
12. [Git & Version Control](#12-git--version-control)

---

## 1. Workflow & Process

### 1.1 Before You Start — Audit the Codebase

Always perform these checks before any implementation:

- **Folder structure**: Entry points, existing components, routes, data models
- **Dependencies**: Read `package.json` / `requirements.txt` / `pyproject.toml`
- **Environment**: Check `.env.example` or config files for env vars in use
- **Coding style**: Linting config (ESLint), formatter (Prettier), naming conventions
- **Docker files**: Examine `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` (or `docker/entrypoint.sh`)
- **Next.js version**: Check `AGENTS.md` / `CLAUDE.md` then read `node_modules/next/dist/docs/` for breaking changes — this version may differ from your training data
- **Git state**: Note current branch, any uncommitted changes, current image tag/version for rollback reference

### 1.2 Design Before Building

1. Summarise what already exists that's relevant to the task
2. Propose an implementation plan with **specific files** to create or modify
3. **Explicitly state Docker impact**: layer caching, image size, volume mounts, entrypoint changes
4. Wait for user confirmation before proceeding

### 1.3 During Development

#### General Rules
- **No regressions** — verify existing functionality remains intact
- **Only modify files directly related to the task** — do not refactor unrelated code
- Ensure **backward compatibility** for functions, APIs, and data schemas
- Match the project's existing **error handling patterns** (try/catch, toast notifications, logging strategy)
- **Do not hardcode secrets or API keys** — use environment variables and `.env` files
- Before adding a new dependency, check if an existing library already covers the need
- Remember: builds happen on Windows, deployment is Docker on Synology NAS. Migrations etc. need to be in Docker infrastructure files

#### Performance & Quality
- Avoid blocking the main thread; use async/await, lazy loading, or workers
- Handle all UI states: **loading, error, empty, and success**
- Run the project's linter and formatter before finishing (ESLint, Prettier)

#### Security
- Never log or expose sensitive data
- Sanitise user inputs; validate on both client and server
- Follow existing auth/permission patterns for new routes or actions
- Docker: **never run containers as root** — use non-root user in Dockerfile

### 1.4 Sub-Agent Workflow

For large tasks, deploy sub-agents in parallel for independent modules:

- Each sub-agent must **check back** before merging their output into the main codebase
- Each sub-agent must document their Docker-related changes
- Sub-agents must run tests and confirm their module is working before reporting complete
- The orchestrating agent performs a final **integration test** after all sub-agents finish
- Agents working on different containers must coordinate on network communication
- **Do not use git for intermediate updates** — user commits manually when task is finished
- Update all relevant worktrees when finished
- Ensure contextual help button is updated 

### 1.5 Testing Protocol

- Test all new code paths, including edge cases
- **Test for existing users** — no breaking changes to current workflows or data
- Verify across environments:
  - **Dev**: Windows native (if applicable)
  - **Docker dev**: Docker Compose on Windows
  - **Staging**: Docker on target NAS architecture
  - **Production**: NAS deployment
- Docker-specific tests:
  - Build image: `docker compose build`
  - Start services: `docker compose up -d`
  - Verify container health checks pass
  - Test volume persistence across container restarts
  - Check network connectivity between containers
  - Verify environment variable injection
  - Test with Windows line endings (CRLF) vs Linux (LF) in mounted files

### 1.6 Completion Checklist

- [ ] Linter and formatter passing
- [ ] No unintended files modified
- [ ] Docker image builds without warnings
- [ ] Container health checks pass
- [ ] Database migrations run successfully
- [ ] New env vars documented in `.env.example`
- [ ] `README.md` updated if build steps changed
- [ ] Summary doc created in `/docs` with:
  - Implementation details
  - Docker build instructions
  - Environment variables added
  - Testing results
  - Rollback procedure

### 1.7 Rollback & Recovery

- Before starting, note the current state of any files to modify (including Docker files)
- Document current image tag/version for rollback reference
- If something breaks in production, document what to revert
- **Prefer feature flags** for large or risky changes so they can be toggled off without a deploy
- **Docker rollback**: Keep previous image tagged, use `docker compose up --no-build`
- Have `docker-compose.yml` backup ready
- Document steps to revert to previous working state

---

## 2. Docker / NAS Deployment

### 2.1 Core Principle

**Build on Windows → Deploy on Synology NAS.** Every feature plan and implementation must explicitly address Docker impact. The three Docker infrastructure files (`Dockerfile`, `docker-compose.yml`, and entrypoint script) must be updated as required and the user prompted to copy them over to the NAS.

### 2.2 Dockerfile Pattern (4-Stage Build)

```
── deps     — install ALL dependencies (npm ci --production=false)
── builder  — build the Next.js app (npm run build)
── pruner   — install clean production-only deps, copy built app
── runner   — minimal production image (node:20-alpine), non-root user
```

Key points:
- **Pruner stage** eliminates the need to manually enumerate `serverExternalPackages`
- Keep good comments on each layer's purpose
- Multi-platform awareness (amd64/arm64 for NAS devices)
- Use `node:20-alpine` as base image
- Create and use a non-root user in the runner stage

### 2.3 docker-compose.yml Requirements

- **Healthcheck**: Poll `/api/health` every 30s (`interval: 30s`, `timeout: 10s`, `retries: 3`)
- **Annotated volume mounts**: Comment each volume with its purpose
- **Environment variables**: Listed above volumes for readability
- **Restart policy**: `unless-stopped`
- **Port mapping**: e.g. `"3000:3000"`
- **Volume mounts**:
  - `/data` — database, uploads, and persistent state
  - App code is baked into the image (not mounted as a volume in production)
  - Configuration files as needed

### 2.4 Entrypoint Script Pattern

Structure the entrypoint as numbered steps (1–6):

1. **Environment validation** — check required env vars exist
2. **Data directory setup** — create `/data` sub-directories (backups, uploads, etc.)
3. **Database migration** — `npx prisma migrate deploy` with fallback to `db push`
4. **Daily backup cron** — schedule via `su-exec` as the `nextjs` user
5. **Database health check** — verify using `sqlite3` CLI or other DB-specific client
6. **Start application** — `exec node server.js`

Critical patterns:
- Pre-migration backups written to `/data/backups/` (not root `/data/`)
- Strict migration error handling — exit cleanly with diagnostics instead of silently falling back
- Daily backup cron runs as `nextjs` user via `su-exec`
- Script remains executable after modifications (`chmod +x`)

### 2.5 Migration Strategy

Prisma migrations run **automatically on every container startup** via `prisma migrate deploy` in the entrypoint script. A fallback `db push` runs if `migrate deploy` fails (needed for bootstrapped databases that pre-date migration history).

To add a new migration:
1. Create a numbered folder under `prisma/migrations/` with a `migration.sql` file (e.g. `0016_my_change/migration.sql`)
2. Update `prisma/schema.prisma`
3. The migration runs automatically on next deploy — no manual step required on the NAS

### 2.6 Build & Deploy Commands

```bash
# Development build with cache
docker compose build

# Force rebuild without cache
docker compose build --no-cache

# Build specific service
docker compose build app

# Deploy on NAS
# 1. Copy updated files (Dockerfile, docker-compose.yml, entrypoint.sh)
# 2. SSH into NAS
# 3. docker compose down && docker compose up -d --build
```

### 2.7 Windows-to-Linux Considerations

- Windows line endings (CRLF) vs Linux (LF) in mounted files — the entrypoint script must remain LF
- Windows path conversions vs Linux paths in containers (e.g. `C:\Appdev\data` → `/data`)
- Always use environment variables or Docker volume mounts — never hardcode paths
- Consider `DATA_PATH` env var pattern (default `./data` in dev, `/data` in Docker)

---

## 3. Next.js Architecture Patterns

### 3.1 App Router Pattern (Consistent Across Features)

```
page.tsx      →  Server Component: calls requireSession(), fetches initial data via Prisma
*Client.tsx   →  Client Component: interactivity, API route calls for mutations
route.ts      →  API Route: guarded by requireSession(), CRUD operations
```

This pattern is used consistently across **9+ features** in HomeBase (recipes, meal plans, lists, chores, contacts, notes, documents, settings, calendars) and all features in Memories (journal entries, media, health data).

### 3.2 Server Page Pattern

```typescript
// page.tsx — server component
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ClientComponent from './ClientComponent'

export default async function Page() {
  const session = await requireSession()
  const data = await prisma.model.findMany({
    where: { familyId: session.user.familyId },
    // ... include relations, orderBy
  })
  return <ClientComponent data={data} />
}
```

### 3.3 Client Component Pattern

- Imported by the server page
- Receives initial data as props
- Calls API routes (e.g. `fetch('/api/recipes')`) for all mutations
- Manages local state with React hooks (useState, useCallback, useEffect)
- Handles loading, error, empty, and success states

### 3.4 API Route Pattern

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

export async function POST(req: Request) {
  const session = await requireSession()
  const body = await req.json()
  // validate body...
  const created = await prisma.model.create({ data: { ...body, familyId: session.user.familyId } })
  return NextResponse.json(created, { status: 201 })
}
```

### 3.5 Next.js Version Awareness

**This is critical.** Each new version may have breaking changes in APIs, conventions, and file structure. Before writing any code:

1. Read `AGENTS.md` / `CLAUDE.md` in the project root (they reference the current version's docs)
2. Check `node_modules/next/dist/docs/` for version-specific guides
3. Heed deprecation notices

### 3.6 Route Structure Convention

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

### 3.7 Settings-First Architecture

User preferences are stored in the database, not hardcoded:

- **JSON columns** on the `User` model for flexible config (e.g. `garminConfig`, `fitbitConfig`, `cardMetrics`, `uiPreferences`)
- **Boolean columns** on the `User` model for simple toggles (e.g. `showWritingPrompts`, `weekStartsOn`)
- Settings flow: `SettingToggle` → `PATCH /api/settings` → database → `GET /api/settings` → consumer component checks the pref

**Critical**: When adding a new setting, ensure the consumer component actually checks the setting value before rendering. The `showWritingPrompts` bug in Memories was caused by the component rendering unconditionally without checking the setting.

---

## 4. Tech Stack

### Core Framework
- **Next.js** (App Router) with TypeScript
- **React 18** (Server Components, Client Components)
- Check version-specific docs in `node_modules/next/dist/docs/`

### Authentication
- **NextAuth.js v4** (used in both projects — Google OAuth for Memories, Credentials Provider for HomeBase)
- Session guarding via `requireSession()` helper
- API routes protected with `requireSession()` on every route

### Database
- **SQLite** via **Prisma ORM** (better-sqlite3)
- Single file database, location controlled by `DATA_PATH` env var
- Prisma for migrations, queries, and type generation

### UI Framework
- **Tailwind CSS** with custom colour palettes
  - Memories: `ink-*`, `cream-*`, `forest-*` (brown/sepia/warm/green journal theme)
  - HomeBase: shadcn/ui default palette
- **shadcn/ui** component library (HomeBase)
- **Lucide React** icons
- **date-fns** for date manipulation and timezone handling

### Styling Conventions
- Avoid raw hex colours in className — use design system tokens
- Responsive design with Tailwind breakpoints (mobile-first)
- Mobile: `< 640px` | Tablet/Desktop: `sm+`

### Key Libraries
- **react-hook-form** + **zod** — form validation
- **@dnd-kit** — drag and drop (lists, reordering)
- **cheero** — web scraping (recipe import)
- **Tiptap 2** — rich text editor (Memories journal)
- **contentEditable** — WYSIWYG note editor (HomeBase notes)
- **Leaflet** — maps (Memories)
- **NextAuth** — authentication

---

## 5. Database & Migrations

### 5.1 Schema Patterns

**Common models** across both projects:
- `User` — preferences as JSON columns, top-level boolean columns for simple toggles
- Family-scoped models (HomeBase): `familyId` on every content model
- User-scoped models (Memories): `userId` on entries, media, health data

**Prisma schema conventions:**
- `@id @default(cuid())` for primary keys
- `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`
- `@relation` with `onDelete: Cascade` for dependent records
- Proper indexes on foreign keys and frequently-queried columns
- `@@unique` constraints where needed
- JSON fields typed as `Json` in Prisma, cast in application code

### 5.2 Migration Workflow

1. Create a numbered folder: `prisma/migrations/NNNN_description/migration.sql`
2. The migration runs automatically on next Docker deploy via the entrypoint
3. For dev: `npx prisma migrate dev` (creates migration file automatically)

### 5.3 SQLite Considerations

- Single file database — `DATA_PATH` env var controls location
- No concurrent write scaling (fine for single-NAS deployment)
- Use SQLite-specific functions where needed (e.g. `$contains` for string matching)
- Backup strategy: entrypoint script creates daily backups to `/data/backups/`

### 5.4 JSON Columns vs Boolean Columns

| Type | When to use | Example |
|------|-------------|---------|
| **JSON column** | Flexible config, multiple sub-fields, third-party service config | `garminConfig: { dataStartDate, cardMetrics, metricsStyle }` |
| **Boolean column** | Simple on/off toggle | `showWritingPrompts: Boolean`, `weekStartsOn: Int` |

---

## 6. UI / UX Conventions

### 6.1 State Handling

Every async operation must handle four states:
- **Loading**: spinner, skeleton, or progress indicator
- **Error**: meaningful error message with retry action where possible
- **Empty**: helpful empty state ("No items found" with action button)
- **Success**: confirm with toast notification

Anti-pattern: Showing "Empty" state when the actual issue is a server error (bug found in HomeBase documents page).

### 6.2 Responsive Design

- Mobile-first with Tailwind breakpoints
- Mobile nav FAB: `fixed bottom-safe-4 right-4` (clears iPhone home indicator)
- Desktop sidebar: `fixed left-0 w-64` with collapse option
- Entry editor footer positioning:
  - `left-0 md:left-64` — clear desktop sidebar on desktop
  - `bottom-12 md:bottom-0` — sit above FAB on mobile

### 6.3 Journal Card Layout (Memories)

All entry card components (`JournalTimeline`, `OnThisDayGallery`, `SharedJournalView`) use `flex-col sm:flex-row`:
- **Mobile** (`< 640px`): image hero on top (`sm:hidden aspect-video`), content stacked below
- **sm+** (tablet/desktop): date column left | content centre | cover image right
- `min-h-[220px]` only applies at `sm:` breakpoint — on mobile height comes naturally from stacked content
- **Do not use plain `flex` (flex-row)** on these cards — a `w-full` image hero in a row consumes 100% width, collapsing content to 0

### 6.4 Mobile Horizontal Overflow

`globals.css` sets `overflow-x: hidden` on both `html` and `body` to prevent wide elements (code blocks, health metric rows, fixed-width components) from causing horizontal scroll on mobile. **Do not remove these** — they are load-bearing for the mobile layout.

### 6.5 Mobile FABs — No Conflicts

The mobile nav FAB sits at `fixed right-4 bottom-safe-4 z-[70]`. Any other floating action button on a page **must not** render on mobile if it would collide with the nav FAB. Use `hidden md:flex` to restrict page-level FABs to desktop only.

### 6.6 iPhone PWA Safe Area

```css
/* globals.css */
@layer utilities {
  .pb-safe {
    padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  }
  .bottom-safe-4 {
    bottom: calc(1rem + env(safe-area-inset-bottom));
  }
}
```

Layout export in `page.tsx` / `layout.tsx`:
```typescript
export const viewport = {
  viewportFit: 'cover',
}
```

### 6.7 z-Index Ladder

| Level | z-index | Element |
|-------|---------|---------|
| Sidebar | `z-50` | Desktop navigation |
| Editor footer | `z-[60]` | Bottom action bars |
| Mobile nav FAB | `z-[70]` | Floating action button |
| Modals | `z-[80]` | Dialog overlays |
| Lightbox | `z-[90]` | Full-screen image viewer |
| Mobile nav sheet | `z-[10051]` | Slide-in navigation |

### 6.8 Deletion Confirmation

**Never delete without confirmation.** Use either:
- Browser `confirm()` dialog (simpler, adequate for most cases)
- A proper Dialog/Modal component (consistent with shadcn/ui pattern)

The contact deletion bug in HomeBase was caused by having no confirmation at all — one mis-click could permanently lose data.

### 6.9 Toast Notifications

Use `sonner` or similar toast library for:
- Successful mutations (create, update, delete)
- Error feedback on failed operations
- Inline within `try/catch` blocks in client components

---

## 7. PWA Patterns

### 7.1 Install Prompt Component

`src/components/ui/InstallPrompt.tsx` — listens for `beforeinstallprompt` and shows a card banner:

- Skip if already installed (`display-mode: standalone` or `navigator.standalone`)
- Skip if previously dismissed (stored in `localStorage`)
- **"Later"** button snoozes for 7 days
- **Install** button triggers native browser install dialog
- **X** permanently dismisses
- **Firefox/Samsung Internet fallback**: if `beforeinstallprompt` doesn't fire within 5s on mobile, shows a manual guide
- Positioned `bottom-[72px]` on mobile, `bottom-6` on desktop, centred at `z-[9999]`
- Only fires on Chrome/Edge/Android — Safari requires manual "Add to Home Screen"
- **Prerequisite**: `public/manifest.json` must exist with valid PWA metadata

### 7.2 Manifest Requirements

```json
{
  "scope": "/",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "prefer_related_applications": false,
  "categories": ["lifestyle", "productivity"],
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- `purpose: "maskable"` icons are required for Chrome on Android install prompt
- Maskable icons have white/theme-colour background with content centred in safe zone (75% of canvas)

### 7.3 Service Worker

- `public/sw.js` — basic service worker for offline fallback
- `public/offline.html` — offline fallback page
- Note: Full offline queue with background sync is a high-value missing feature (for shopping list usage at supermarket)

### 7.4 Offline Editing (Memories Pattern)

The Memories app supports full offline creation and editing of journal entries via IndexedDB and a service worker.

**IndexedDB stores** (`src/lib/offline/`):
- `pending_ops` — queued `create_entry` / `update_entry` ops
- `offline_entries` — full snapshot of entries created while offline (`offline_xxx` IDs)
- `pending_attachments` — binary photo data awaiting upload
- `rollback_snapshots` — "before" state of real entries captured just before an offline edit syncs (48h TTL)

**Sync flow:**
1. **Offline create**: generates temp ID `offline_xxx`, saves to `offline_entries` + `pending_ops`
2. **Offline edit** (existing entry): `upsertPendingUpdate()` deduplicates rapid auto-saves into one `update_entry` op; **payloads are merged** (not replaced) so a location-only or tag-only call can't clobber pending body/mood changes
3. **Reconnect**: `useOffline.ts` fires `syncNow()` → `processQueue()` runs creates → updates → photo uploads in order
4. **ID resolution**: temp IDs created in the same sync run are resolved via `idMappings` before update/upload ops apply
5. **URL fix**: if user is on `/entry/offline_xxx`, the URL is replaced with the real ID after sync

**Offline writes beyond body/title** — tag, location, and clear operations all branch on connectivity:
- **Online, real entry**: PATCH to server immediately
- **Offline, real entry**: call `upsertPendingUpdate(entryId, { ...fields })` — merged into any existing pending op
- **Offline entry (`offline_xxx`)**: write directly to IDB via `saveOfflineEntry`

**Attachment retries**: `PendingAttachment` has a `retries` counter. After 3 failures, the attachment is permanently removed (prevents infinite retry loops on unrecoverable errors like 413 file-too-large).

**Rollback snapshots**: Before syncing an `update_entry` op for a real entry, `processQueue()` fetches the server's current state. After sync, a banner shows: **"Updated from an offline draft. [Undo] [Keep]"**. Snapshots expire after 48 hours.

**Bootstrap safety guard**: `bootstrapSucceeded` ref prevents auto-save from queuing a blank `update_entry` op when an entry fails to load offline (cold cache).

**AuthGuard offline behaviour**: Shows a spinner when `status === 'unauthenticated'` and offline (cold session cache). A second `useEffect` listens for the `online` event and redirects to `/auth/signin` as soon as connectivity returns.

**Service worker cache warming**: `warmApiCache()` fetches `/api/entries?limit=30` on SW `activate` and on `WARM_CACHE` message, caching each individual entry API response so the 30 most recent entries are available offline without prior visits.

---

## 8. Health Data Integration Patterns

*(From Memories journal app — multi-source health data from wearables)*

### 8.1 Multi-Source Strategy

| Source | Field on Entry | Library | Config Key |
|--------|---------------|---------|------------|
| Garmin | `activityData` (JSON) | `garmin-connect` + Python fallback | `garminConfig` |
| Fitbit | `fitbitData` (JSON) | `src/lib/fitbit/` | `fitbitConfig` |
| Withings | `withingsData` (JSON) | `src/lib/withings/` | `withingsConfig` |

### 8.2 Display Rule

**Never render a metric whose value is 0.** Always guard with `> 0` (not just `!= null`):

```typescript
if (cm.includes('steps') && typeof ad.steps === 'number' && ad.steps > 0)
```

For Withings:
```typescript
if (cm.includes('weight') && wd.weight != null && wd.weight > 0)
```

### 8.3 Garmin Era Guard

**Never render Garmin `activityData` on entries that predate `dataStartDate`.** Entries from the Fitbit era can have stale or incorrectly-synced data:

```typescript
const rawStart = garminConfig?.dataStartDate
if (rawStart && entryDateStr) {
  let startStr = rawStart
  if (startStr.includes('/')) {
    const [d, m, y] = startStr.split('/')
    startStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (entryDateStr < startStr.slice(0, 10)) return null  // Fitbit era — skip Garmin
}
```

`dataStartDate` may be stored as DD/MM/YYYY or YYYY-MM-DD — always normalise before comparing.

### 8.4 Data Source Strategy

Stats and year-review read from the canonical **daily tables**, never from entry snapshots:
- **Garmin era** (date ≥ `dataStartDate`): `GarminDailyData` table
- **Fitbit era** (date < `dataStartDate`): `FitbitDailyData` table

Split queries between the two tables with no overlap and no double-counting.

### 8.5 Data Integrity

- `mergeActivityData` in sync routes protects existing non-zero metric values from being overwritten by a fresh 0 (Garmin returns 0 on rest days)
- All distances stored in **km** consistently (a bug once had Fitbit distance 100× too large — corrected via fix script)
- Garmin HRV (Heart Rate Variability): `lastNight` RMSSD value from Garmin API, falling back to `weeklyAvg`

---

## 9. Common Pitfalls & Anti-Patterns

*(All discovered and fixed during real code reviews)*

### 9.1 Copy-Paste Bugs in Date Calculations

**Problem**: Hardcoded values, duplicated logic across multiple locations.
**Example**: `weekStartsOn: 0` (Sunday) hardcoded when user's preference was available.
**Example**: Identical 15-line UTC date conversion blocks duplicated across 4 functions in `MealPlanGrid`.
**Fix**: Extract to a shared utility function; always pass user preferences as parameters.

### 9.2 API Shape Assumptions

**Problem**: Client code assumes a specific response shape from the API. If the API changes, the client silently corrupts state.
**Example**: `ChoresClient` destructuring `data.chore` and `data.completion` — if the API returns a different shape, the spread of `undefined` into state goes unnoticed.
**Fix**: Verify API response shape matches client expectations, or add defensive checks / TypeScript type validation.

### 9.3 Missing Error States

**Problem**: Server error results in misleading UI (empty state instead of error message).
**Example**: Documents page showing "No documents found" when the fetch failed.
**Fix**: Add a `fetchError` state separate from `loading` — show error panel with "Try again" on failure.

### 9.4 Settings Saved But Not Checked

**Problem**: A setting is properly saved to the database and loaded by the client, but the consumer component never checks it.
**Example**: `showWritingPrompts` was correctly stored in the database and returned by the settings API, but the `EntryEditor` rendered the writing prompts unconditionally.
**Fix**: When adding a new toggle setting, explicitly verify the consumer component checks the value.

### 9.5 Missing Delete Confirmations

**Problem**: Destructive actions without confirmation.
**Example**: Contact deletion had no `confirm()` dialog — one mis-click permanently lost data. Recipes and lists had confirmation, but contacts didn't.
**Fix**: Every delete action must have confirmation — either browser `confirm()` or a proper Dialog component.

### 9.6 Invalid POST Bodies

**Problem**: API rejects a request because required fields are missing from the POST body.
**Example**: Quick Add recipe creation always returned 400 because the POST body omitted `ingredients` and `instructions` arrays.
**Fix**: Ensure POST bodies match the API's validation expectations.

### 9.7 Type Casts vs Proper Typing

**Problem**: Using `as` type assertions to suppress TypeScript errors rather than fixing the underlying type mismatch.
**Example**: `ref={inputRef as React.Ref<HTMLInputElement>}` in QuickAdd component.
**Fix**: Fix the type definitions or the prop interface rather than resorting to type casts.

### 9.8 Optimistic Updates Without Error Revert

**Problem**: Optimistic UI updates that succeed visually but don't revert if the API call fails.
**Fix**: Either implement proper rollback on error, or skip optimistic updates and use loading states.

---

## 10. Feature Implementation Blueprints

*(Common patterns extracted from both projects — use these as templates)*

### 10.1 Standard CRUD Feature

Every CRUD feature follows the same pattern:

```
Schema:    prisma/schema.prisma — add model with familyId/userId, standard fields, indexes
Migration: prisma/migrations/NNNN_description/migration.sql

Server page:
  src/app/(app)/feature/page.tsx                    — server component, requireSession(), fetch data
  src/app/(app)/feature/FeatureClient.tsx            — client component with state, handlers, API calls

API routes:
  src/app/api/feature/route.ts                       — GET (list), POST (create)
  src/app/api/feature/[id]/route.ts                  — GET, PATCH, DELETE
  src/app/api/feature/[id]/nested-action/route.ts    — special operations (complete, rotate, reorder)

Components:
  src/components/feature/FeatureCard.tsx              — individual item display
  src/components/feature/FeatureForm.tsx              — create/edit form (dialog)

Navigation:
  src/components/layout/Sidebar.tsx                   — add nav item
  src/components/layout/MobileNav.tsx                 — add nav item (mobile)

Dashboard (optional):
  src/components/dashboard/FeatureSummaryCard.tsx     — optional dashboard widget
  src/lib/dashboard-cards.ts                          — register new card

Types:
  src/types/index.ts                                  — TypeScript interfaces
```

### 10.2 Quick Add Pattern

The Quick Add component (in the sidebar/header) allows rapid creation:
- Typed or dropdown selection of item type (recipe, list, meal, note, etc.)
- API call on submission
- Toast notification on success/error
- **Ensure POST body matches API validation expectations** (common failure point)

### 10.3 Search/Filter Pattern

Client-side search across fetched data:
```typescript
const [search, setSearch] = useState('')
const [tagFilter, setTagFilter] = useState<string | null>(null)
const filtered = data.filter(item => {
  if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
  if (tagFilter && !item.tags.includes(tagFilter)) return false
  return true
})
```

### 10.4 Delete Confirmation Pattern

```typescript
async function handleDelete(id: string, name: string) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  try {
    const res = await fetch(`/api/feature/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete')
    setItems(prev => prev.filter(i => i.id !== id))
    toast.success(`${name} deleted`)
  } catch {
    toast.error('Failed to delete')
  }
}
```

### 10.5 Recipe Scaling Pattern

```
Scale factor = currentServings / originalServings
  1. Serving stepper on recipe detail page (only when `servings` is set)
  2. Parse ingredient quantities, multiply by scale factor
  3. Display as vulgar fractions (½, ¼, ¾) where appropriate
  4. "Scaled" badge when not at original serving count
  5. Reset button to return to original quantities
  6. Underlying recipe data NOT modified
```

---

## 11. Debugging & Recovery

### 11.1 Prisma Studio

```bash
npx prisma studio     # Open database GUI in browser
npm run db:studio      # (if aliased in package.json)
```

Use for direct database inspection and quick troubleshooting.

### 11.2 Migration Verification

```bash
# Check migration state
npx prisma migrate status

# Verify in container
docker compose exec app npx prisma migrate status
```

### 11.3 Container Health Checks

The healthcheck endpoint (`/api/health`) should:
- Return 200 if the app is running and database is reachable
- Be polled every 30s by Docker
- Fail after 3 retries, triggering container restart via `restart: unless-stopped`

### 11.4 Log Management

- Garmin logs auto-purge logs older than 30 days on each API call
- Manual clear endpoint for immediate deletion
- Application logs via `console.log` / `console.error` — captured by Docker

### 11.5 Database Backup & Restore

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

### 11.6 Quick Diagnostic Commands

```bash
# Check migration status
docker compose exec app npx prisma migrate status

# Interactive database exploration
docker compose exec app npx prisma studio

# Check container health
docker compose ps

# View logs
docker compose logs app
docker compose logs app --tail 100

# Execute SQL query directly
docker compose exec app sqlite3 /data/database.sqlite "SELECT * FROM User;"
```

---

## 12. Git & Version Control

### Commit Guidelines
- Use descriptive commit messages explaining **what** and **why**
- Do not mix unrelated changes in a single commit
- **Do not use git for intermediate updates** — user commits manually when task is finished
- Update all relevant worktrees when finished
- Note which files were changed and why in the completion summary

### Docker File Commit Rules
- Commit `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` together when modified
- Document breaking changes in commit message (e.g. environment variable removals)
- Tag commits that change Docker configuration

### Rollback References
- Before starting any task, note current state of files to modify
- Document current image tag/version for rollback reference
- Keep previous Docker image tagged for `docker compose up --no-build` rollback

---

## Appendix A: Project Reference

### Memories (Personal Journal)
- **Tech**: Next.js 14, NextAuth v4 (Google OAuth), SQLite + Prisma, Tiptap 2, Leaflet
- **Domain**: Journal entries, rich text, Google Drive media, health data (Garmin/Fitbit/Withings)
- **Deploy**: Docker → Synology NAS
- **Port**: 3000

### HomeBase (Family Management)
- **Tech**: Next.js (latest), NextAuth v4 (Credentials), SQLite + Prisma, shadcn/ui
- **Domain**: Recipes, meal plans, shopping lists, chores, contacts, notes, documents, calendar, events
- **Deploy**: Docker → Synology NAS
- **Port**: 3000

---

*Compiled from: Memories CLAUDE.md, HomeBASE CLAUDE.md/AGENTS.md, .clinerules.md (both projects), Ai App Build Instructions.md (both projects), deep-dive-review-april-2026.md, homebase-backlog-build-plans.md — May 2026*