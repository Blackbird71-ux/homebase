# General coding discipline

## 1. Surface assumptions before coding
State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask rather than guessing.

## 2. Simplicity first
Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code, no speculative flexibility. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?"

## 3. Surgical changes
Touch only what you must. Don't improve adjacent code, comments, or formatting that isn't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request.

## 4. Plan before multi-step tasks
For any task with more than one distinct step, state a brief plan with verifiable outcomes before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Form / Dialog / Editor safety rules — READ BEFORE TOUCHING ANY FORM

These rules exist because layout refactors repeatedly caused silent field loss (fields removed from the UI without data loss, but the user loses the ability to set/edit them). This is a recurring bug pattern and must be prevented proactively.

## Before editing any form, dialog, or editor component

1. **Enumerate all inputs first.** Before making any change, read the component and list every `<input>`, `<select>`, `<textarea>`, and checkbox in it — including those hidden behind conditionals (`form.billType === 'recurring'`, etc.).

2. **Verify all are still present after editing.** Cross-check the post-edit component against the list from step 1. Every field must still appear in the JSX somewhere.

3. **Never remove a field without explicit user instruction.** If a field needs to move (e.g., to a different column or tab), move it — don't drop it. Removing a form field is a user-visible breaking change. If you think a field should be removed, stop and ask first.

4. **"Preview-only" is not an excuse.** Do not replace editable fields with read-only display, and do not add notices like "this field is preview-only" unless the user has specifically asked for that behaviour. If a field appears in the DB schema, the user should be able to edit it.

## When creating a new form that mirrors an existing model

1. **Cross-check the Prisma schema.** Open `prisma/schema.prisma` and read the model definition. Every scalar field that makes sense in the UI must appear in both the TypeScript interface AND the JSX form.

2. **Match the TypeScript interface to the model.** If the API returns a field (confirmed by reading the route), the interface must declare it. A narrower interface than the DB model is a latent bug.

3. **Populate all fields in `openEdit`-style functions.** When seeding a form from fetched data, every interface field must be explicitly assigned — not just the ones that seem obvious. Silently falling back to `emptyForm` defaults for fields that exist in the data is a bug.

4. **Send all editable fields in PATCH/PUT bodies.** If a field appears in the form, it must be sent to the API. If the API doesn't accept it yet, update the API handler at the same time.

## When refactoring layout (columns, tabs, accordions, scroll regions)

- Layout changes are the highest-risk operation for field loss. Treat them like a surgical procedure: read, list fields, edit, verify.
- Moving sections into tabs or collapsible panels is only safe if *every section is reachable* — not just theoretically scrollable. If a section can be pushed below the fold by taller siblings, split it into its own independently-scrollable pane.
- Do not consolidate two separately-scrollable sections into one shared scroll region without explicitly verifying that the content fits within the dialog height.

## Quick checklist before submitting any form-related change

- [ ] Listed all fields before editing
- [ ] All fields present after editing
- [ ] No field removed without user instruction
- [ ] TypeScript interface matches DB fields returned by the GET API
- [ ] `openEdit`/`openNew` populates every interface field
- [ ] PATCH/PUT body includes every editable field
- [ ] API handler accepts every field sent by the form

---

# Finance module architecture — shared functions over inline logic

**Keep accounting logic in `src/lib/` helpers, not duplicated in routes or pages.**

This rule exists because inline copies of accounting logic (journal creation, reversal, balance calculation) cause the same bug to exist in multiple places — fixing it in one route leaves the others broken, and inconsistent behavior erodes accounting integrity.

## Rules

1. **Never write GL posting logic inline in an API route.** If a route needs to create a journal entry, call a shared function in `src/lib/` (e.g., `postBillAccrualJournal`, `upsertBillDraftJournal`). If the shared function doesn't exist yet, create it before writing the route logic.

2. **Pages call APIs; pages do not calculate GL amounts.** A `.tsx` page component must never compute account balances, post journal entries, or make accounting decisions. All such logic belongs in API routes and `src/lib/` helpers.

3. **One fix, one place.** If you find yourself updating the same accounting logic in more than one file, stop — extract it to a shared function first, then update the callers.

4. **Shared helpers are the source of truth.** If `src/lib/` has a function for an operation (e.g., `ensureAccountsPayableCategory`), every route that needs that operation must call that function. Never re-implement it inline.

---

# Drawer pattern standards

All form editors, detail panels, and complex dialogs must use the right-side Drawer from `@/components/ui/sheet`. Centred `Dialog` is only appropriate for small confirm/alert prompts (≤2 fields: void, delete, PIN unlock, import).

## Required structure

```tsx
<Drawer open={open} onOpenChange={onOpenChange}>
  <DrawerContent className="sm:max-w-[Npx]" showCloseButton={true}>
    <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
      <DrawerTitle>Title</DrawerTitle>
    </DrawerHeader>
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* form fields */}
    </div>
    <DrawerFooter className="border-t border-border">
      {/* Cancel / Save buttons */}
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

## Width standards

| Width | Use for |
|---|---|
| 480px | 2–3 simple fields |
| 560px | Standard forms (~10 fields) |
| 720px | Complex forms (10–15 fields) |
| 800px | Tabbed editors or multi-section forms |
| 900px | Two-column with journal lines (finance editors) |

## Rules

1. **`showCloseButton={true}` is required on every `DrawerContent`.** Without it, no X button is rendered.
2. **`WideDialogContent` must not be used for editors.** All usages have been removed; the definition remains in `dialog.tsx` only.
3. **After any layout change touching a Drawer, grep for missing `showCloseButton`:**
   ```
   grep -rn "DrawerContent" src/ --include="*.tsx" | grep -v "showCloseButton\|import\|sheet.tsx"
   ```
4. **`ActivityEditDialog` uses custom `hb-drawer` CSS and is a known exception** — do not convert without user instruction.

---

# Regression Prevention

See `QA.md` in the project root for:
- Developer blast-radius protocol (§1) — run before ANY change
- Finance accounting invariants (§2) — GL rules an accountant would enforce
- Complete end-to-end lifecycle flows (§4) — bill, income, payslip, journal, opening balances
- Regression smoke tests by module (§5, §10) — run after any finance change
- Accountant verification checklist (§6) — trial balance, P&L, balance sheet, AR/AP, PAYG
- Shared code blast-radius reference (§9) — which files affect which flows
- Known bug patterns to avoid repeating (§12)

**The finance module has critical implications for real money. Always consult QA.md before and after any finance-related change.**
