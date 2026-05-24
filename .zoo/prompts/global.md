# Zoo Global Development Preferences

## General Coding Discipline

### 1. Surface assumptions before coding
State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask rather than guessing.

### 2. Simplicity first
Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code, no speculative flexibility. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?"

### 3. Surgical changes
Touch only what you must. Don't improve adjacent code, comments, or formatting that isn't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request.

### 4. Plan before multi-step tasks
For any task with more than one distinct step, state a brief plan with verifiable outcomes before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

## Timezone Rules — ALL date logic must work in the user's local time

The server runs in UTC. The database stores all datetimes in UTC. The user lives in a local timezone (e.g. Australia/Sydney = UTC+10). These are not the same and the difference causes bugs.

**The rule: every date boundary, filter, and display must be computed relative to the user's local timezone, not UTC.**

### The correct pattern

Use helpers from `src/lib/timezone.ts` — these are the **only** approved ways to compute date boundaries and format dates:

```ts
// Today's start/end as UTC Dates representing local midnight:
const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
// todayStart for UTC+10 on 2026-05-23 = 2026-05-22T14:00:00Z  ← NOT 2026-05-23T00:00:00Z

// Rolling N-day window end:
const endDate = nDaysFromTodayInTz(7, timezone)

// Timezone-aware display (replaces date-fns format):
const label = formatInTz(date, timezone, { weekday: 'short', day: 'numeric', month: 'short' })

// Calendar day bucketing for events:
const onDay = eventFallsOnDay(event, day, timezone)  // from src/lib/event-helpers.ts
```

**Meal plan exception:** Meal plan dates use UTC midnight by convention — display with `timeZone: 'UTC'`, not `formatInTz`.

### The failure modes

**Missing events:** UTC midnight as a query bound is wrong for UTC+10 — it's 10 hours late. Events before 10am local time are excluded.

**Duplicate events (spillover):** Synthetic all-day events store `end = T23:59:59.000Z`. For UTC+10 that's next-day 09:59. `startOfDay(new Date(event.end))` produces next-day midnight, so the event appears on two consecutive days. Fix: `eventFallsOnDay(event, day, timezone)`.

### Rules

1. **Never** use `new Date('YYYY-MM-DDT00:00:00Z')` as a day boundary → use `todayBoundsInTz(timezone)`
2. **Never** use `startOfDay(new Date(event.end))` to bucket calendar events → use `eventFallsOnDay(event, day, timezone)`
3. **Never** `import ... from 'date-fns'` in server-side files → use helpers from `src/lib/timezone.ts`
4. **Display** dates with `formatInTz(date, timezone, options)` — not `format()` from date-fns

---

## Form / Dialog / Editor Safety Rules — READ BEFORE TOUCHING ANY FORM

These rules exist because layout refactors repeatedly caused silent field loss (fields removed from the UI without data loss, but the user loses the ability to set/edit them). This is a recurring bug pattern and must be prevented proactively.

### Before editing any form, dialog, or editor component

1. **Enumerate all inputs first.** Before making any change, read the component and list every `<input>`, `<select>`, `<textarea>`, and checkbox in it — including those hidden behind conditionals (`form.billType === 'recurring'`, etc.).

2. **Verify all are still present after editing.** Cross-check the post-edit component against the list from step 1. Every field must still appear in the JSX somewhere.

3. **Never remove a field without explicit user instruction.** If a field needs to move (e.g., to a different column or tab), move it — don't drop it. Removing a form field is a user-visible breaking change. If you think a field should be removed, stop and ask first.

4. **"Preview-only" is not an excuse.** Do not replace editable fields with read-only display, and do not add notices like "this field is preview-only" unless the user has specifically asked for that behaviour. If a field appears in the DB schema, the user should be able to edit it.

### When creating a new form that mirrors an existing model

1. **Cross-check the Prisma schema.** Open [`prisma/schema.prisma`](prisma/schema.prisma) and read the model definition. Every scalar field that makes sense in the UI must appear in both the TypeScript interface AND the JSX form.

2. **Match the TypeScript interface to the model.** If the API returns a field (confirmed by reading the route), the interface must declare it. A narrower interface than the DB model is a latent bug.

3. **Populate all fields in `openEdit`-style functions.** When seeding a form from fetched data, every interface field must be explicitly assigned — not just the ones that seem obvious. Silently falling back to `emptyForm` defaults for fields that exist in the data is a bug.

4. **Send all editable fields in PATCH/PUT bodies.** If a field appears in the form, it must be sent to the API. If the API doesn't accept it yet, update the API handler at the same time.

### When refactoring layout (columns, tabs, accordions, scroll regions)

- Layout changes are the highest-risk operation for field loss. Treat them like a surgical procedure: read, list fields, edit, verify.
- Moving sections into tabs or collapsible panels is only safe if *every section is reachable* — not just theoretically scrollable. If a section can be pushed below the fold by taller siblings, split it into its own independently-scrollable pane.
- Do not consolidate two separately-scrollable sections into one shared scroll region without explicitly verifying that the content fits within the dialog height.

### Quick checklist before submitting any form-related change

- [ ] Listed all fields before editing
- [ ] All fields present after editing
- [ ] No field removed without user instruction
- [ ] TypeScript interface matches DB fields returned by the GET API
- [ ] `openEdit`/`openNew` populates every interface field
- [ ] PATCH/PUT body includes every editable field
- [ ] API handler accepts every field sent by the form

---

## ⚡ REDUCE PROMPTS — Critical Rules

### One-Shot Delivery (No In-Task Questions)
- Read EVERYTHING you need first in ONE parallel batch of read_file calls
- Present the full plan in ONE message (max 5 sentences). No "shall I proceed?" or "does this look good?"
- Implement EVERYTHING in as FEW apply_diff calls as possible (aim for 1-3 total). Pack multiple SEARCH/REPLACE blocks into each call.
- Run build/test ONCE at the end. Only stop if there's a compilation error.
- NEVER ask for permission between steps. The user gave you a task — do it.

### No Per-Phase Checkpoints — ZERO EXCEPTIONS
- DO NOT break work into phases that each require approval
- DO NOT ask "phase X complete, proceed to phase Y?"
- DO NOT wait for confirmation between successive edits
- DO NOT present intermediate results for feedback
- DO NOT use `update_todo_list` during active implementation (saves 1+ prompts per step)
- DO NOT call `attempt_completion` until the ENTIRE task is done
- If a change is complex, just batch it into fewer, larger apply_diff calls

### Tool Call Batching Rules
- **read_file**: Call ALL reads in a single parallel batch. Never more than 2 read_file batches total for the entire task.
- **apply_diff**: NEVER call with only 1 SEARCH/REPLACE block. Minimum 3-5 blocks per call. Target 1-3 apply_diff calls total.
- **execute_command**: Max 2-3 commands total (generate, build, maybe test). Chain commands with && when possible:
  - `git add -A && git commit -m "..."` — never separate add and commit
  - `npx prisma generate && npx next build` — combine generation and build
- **search_files**: Only use if you genuinely cannot find what you need via read_file.

### Self-Healing on Tool Failures (CRITICAL)
- If `apply_diff` fails due to SEARCH mismatch: **IMMEDIATELY re-read the file** and retry with the exact content. Do NOT expose the error to the user.
- If `execute_command` fails: re-read the error, fix the issue, retry silently. Do NOT ask "what should I do?"
- The user should **never see tool errors**. Every failure must be silently recovered and retried in the next message.
- Exception: only ask for help if the task is genuinely blocked on missing information the user must provide.

## Universal Rules

### Investigation First
- Read ALL relevant files in ONE parallel batch before presenting any plan
- Understand dependencies and side effects from those reads alone
- Do not ask for clarification unless the spec is truly ambiguous

### Summary Before Action
- Provide ONE structured summary covering the entire task (not per-phase):
  1. **What I found** (2-3 sentences on relevant files)
  2. **What I'll do** (specific files and modifications)
  3. **Risks** (if any)
- Then implement immediately. No waiting.

### Quality Over Speed
- Reject "quick fixes" - always implement proper solutions
- No technical debt shortcuts

### Data Persistence First
- Default assumption: data lives outside containers
- Use host-mounted volumes for files
- Use persistent databases with external storage

### Configuration Over Hard-Coding
- Default to configurable settings
- If hard-coding seems necessary, explain why briefly

## Code Quality Standards

### Style & Polish
- Modern, clean, professional appearance
- Consistent formatting with project standards
- Responsive design for UI work
- Smooth interactions and proper loading states

### Documentation
- Comments explain "why", not "what"
- Update README when adding significant features
- Document environment variables in .env.example

### Error Handling
- Graceful degradation
- User-friendly error messages
- Proper logging for debugging
- Never expose internal errors to end users

## Communication Style

### Be Direct
- No pleasantries. No "Great question!" No "Certainly!"
- State findings and actions concisely
- Use bullet points, not paragraphs

### When You Need More Info (Rare)
- Ask ONE specific question with 2-3 suggested answers
- Do not ask open-ended questions

## Project Context Hints
- Check for existing patterns before creating new ones
- Respect existing architecture decisions
- If something seems outdated, suggest modernization with migration path

## SSR Safety — browser APIs crash the server

Next.js renders pages on the server first. `sessionStorage`, `localStorage`, `window`, and `document` do not exist in Node.js. Accessing them at module load time or in `useState` initialisers throws a `ReferenceError` that crashes SSR.

### Rules

1. **Never** access `sessionStorage`, `localStorage`, `window`, or `document` in a `useState` initialiser — move to `useEffect`.
   ```tsx
   // WRONG — crashes SSR:
   const [val, setVal] = useState(localStorage.getItem('key') ?? '')
   // RIGHT:
   const [val, setVal] = useState('')
   useEffect(() => { setVal(localStorage.getItem('key') ?? '') }, [])
   ```
2. Guard with `typeof window !== 'undefined'` if you must read a browser API outside `useEffect`.
3. **Never** use `requireSession()` or `requireAdmin()` in API route handlers — use `auth()` directly and return `NextResponse.json({ error }, { status })`.

---

## Pre-Code Checklist — work through before writing code

### Every change
- [ ] `npx tsc --noEmit` passes before AND after the change
- [ ] Touched a shared lib function? Grep all callers — fix the same pattern everywhere
- [ ] Every changed line traces directly to the user's request — no bonus cleanup

### Date and time
- [ ] No `new Date('YYYY-MM-DDT00:00:00Z')` as a day boundary → use `todayBoundsInTz(timezone)`
- [ ] No `date-fns` in server-side files → use helpers from `src/lib/timezone.ts`
- [ ] No `startOfDay(new Date(event.end))` for calendar bucketing → use `eventFallsOnDay(event, day, timezone)`
- [ ] Display dates with `formatInTz(date, timezone, options)` — not `format()` from date-fns
- [ ] Meal plan dates: display with `timeZone: 'UTC'` (one exception)

### Forms and dialogs
- [ ] List every `<input>`, `<select>`, `<textarea>`, and checkbox before editing
- [ ] Verify every field is still present after editing
- [ ] `openEdit`/`openNew` explicitly assigns every interface field
- [ ] PATCH/PUT body sends every editable field
- [ ] API handler accepts every field the form sends

### Drawers
- [ ] Every `DrawerContent` has `showCloseButton={true}`

### Finance
- [ ] Read QA.md §1 (blast-radius) before touching any finance file
- [ ] GL posting logic in `src/lib/` helpers only — never inline in a route
- [ ] Bug in bills? Check income for the same bug. Bug in income? Check bills.

### SSR safety
- [ ] No browser APIs (`localStorage`, `sessionStorage`, `window`, `document`) in `useState` initialisers
- [ ] No `requireSession()`/`requireAdmin()` in API route handlers — use `auth()` directly

---

## 🗄️ Prisma Migration Rule — MANDATORY (Failure = Server Crash)
Any modification to `prisma/schema.prisma` that adds, removes, or alters a model/field **MUST** also create a corresponding migration directory under `prisma/migrations/` following the established naming convention (e.g., `20260540000000_add_description/`). The migration directory MUST contain:
1. `migration.sql` — the raw SQL ALTER TABLE / CREATE TABLE statement
2. `migration_lock.toml` — provider lock file (content: `provider = "sqlite"`)

This is non-negotiable because `docker/entrypoint.sh` runs `prisma migrate deploy` on server startup, which ONLY applies migrations from these directories. Using `prisma db push` alone causes the server to crash on deploy because the database schema won't match the generated Prisma client.

**Checklist when touching schema.prisma:**
- [ ] Created migration directory `prisma/migrations/YYYYMMDDHHMMSS_description/`
- [ ] Added `migration.sql` with ALTER TABLE / CREATE TABLE statements
- [ ] Added `migration_lock.toml` with `provider = "sqlite"`
- [ ] Ran `npx prisma generate` to regenerate the client
- [ ] Ran `npx prisma db push --accept-data-loss` (dev only — keeps local DB in sync)
- [ ] Committed all files including migration directory
