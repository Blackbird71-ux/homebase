# Global Development Preferences

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