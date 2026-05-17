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
