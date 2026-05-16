# Notes: Archive & Category Tabs

**Date:** 2026-05-16

## Overview

Added archive functionality and dynamic category tabs to the Notes module. Notes can now be archived (hidden from active views but kept for reference) and the tab bar dynamically shows tabs for each unique category.

## Changes

### Prisma Schema
- Added `isArchived Boolean @default(false)` to the Note model in [`prisma/schema.prisma`](../prisma/schema.prisma)
- Migration [`prisma/migrations/20260547000000_add_notes_archive/migration.sql`](../prisma/migrations/20260547000000_add_notes_archive/migration.sql):
  ```sql
  ALTER TABLE "Note" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
  ```

### API Routes

| Route | Method | Change |
|-------|--------|--------|
| `/api/notes` | GET | Added `?archived=true\|false\|all` query param to filter by archive status. Default (no param) excludes archived notes. |
| `/api/notes/[id]` | GET | Now returns `isArchived` in response |
| `/api/notes/[id]` | PUT | Accepts `isArchived` in request body, persists to database |
| `/api/notes/[id]/archive` | PATCH | **New.** Toggles archive status. Body: `{ isArchived: boolean }`. Returns updated note. |

### Components

#### NoteCard ([`src/components/notes/NoteCard.tsx`](../src/components/notes/NoteCard.tsx))
- **Archive badge**: Shows "Archived" label with ArchiveIcon when `isArchived` is true
- **Dimmed appearance**: Archived cards render at `opacity-70`
- **Hover action**: Archive/Restore button appears on hover (top-right, between edit and delete)
- **New prop**: `onArchive?: (id: string, isArchived: boolean) => void`

#### NoteEditor ([`src/components/notes/NoteEditor.tsx`](../src/components/notes/NoteEditor.tsx))
- **Archive toggle**: Switch control between visibility toggle and PIN protection sections
- Toggling on shows "Archived note — Hidden from main view, visible in Archived tab"
- Toggling off shows "Archive note — Keep for reference, hide from active tabs"
- **New prop**: `initialIsArchived?: boolean`
- Submits `isArchived` in the `onSubmit` data payload

#### NoteDetail ([`src/app/(app)/notes/[id]/NoteDetail.tsx`](../src/app/(app)/notes/NotesClient.tsx))
- **Archive/Restore button**: Placed between Lock and Edit buttons in the action bar
- Calls `PATCH /api/notes/[id]/archive` and refreshes the page
- **Archive badge**: Shown in header alongside Secure/Private badges when archived

#### NotesClient ([`src/app/(app)/notes/NotesClient.tsx`](../src/app/(app)/notes/NotesClient.tsx))
- **Tab bar** (horizontal scrollable):
  - `Family` tab — shows non-private, non-archived notes
  - `Private` tab — shows current user's private, non-archived notes
  - `Secure` tab — shows PIN-protected, non-archived notes
  - **Dynamic category tabs** — one tab per unique category from non-archived notes, uses FolderIcon
  - `Archived` tab — shows all archived notes with ArchiveIcon
- **Filtering logic**:
  - Archived notes are excluded from Family/Private/Secure/category tab counts and views
  - Archived tab shows only archived notes
  - Category filter dropdown still works for further refinement on applicable tabs
- **Archive action**: `handleArchiveNote` calls `PATCH /api/notes/[id]/archive` and updates local state

## Usage

### Archiving a note
1. **From the card**: Hover over a note card → click the archive icon (box with down-arrow)
2. **From the detail view**: Open a note → click the archive button in the action row
3. **From the editor**: Edit a note → toggle the "Archive note" switch → Save

### Viewing archived notes
- Click the **Archived** tab in the tab bar to see all archived notes
- Archived cards appear dimmed with an "Archived" badge

### Restoring a note
1. Go to the **Archived** tab
2. Hover over a card → click the restore icon (box with up-arrow)
3. Or open the note detail → click **Restore** button
4. Or edit the note → toggle off "Archived" → Save

### Category tabs
- Categories are automatically derived from non-archived notes that have a category set
- Click a category tab to filter to only notes in that category
- Category tabs use FolderIcon and show the count of non-archived notes

## Files Modified/Created

| File | Status |
|------|--------|
| `prisma/schema.prisma` | Modified — added `isArchived` field |
| `prisma/migrations/20260547000000_add_notes_archive/migration.sql` | Created |
| `src/app/api/notes/route.ts` | Modified — archive query param support |
| `src/app/api/notes/[id]/route.ts` | Modified — isArchived in select/response/PUT |
| `src/app/api/notes/[id]/archive/route.ts` | Created — PATCH endpoint |
| `src/app/(app)/notes/page.tsx` | Modified — isArchived in select/response |
| `src/components/notes/NoteCard.tsx` | Modified — archive badge/hover action |
| `src/components/notes/NoteEditor.tsx` | Modified — archive toggle |
| `src/app/(app)/notes/[id]/NoteDetail.tsx` | Modified — archive/restore button |
| `src/app/(app)/notes/NotesClient.tsx` | Modified — archived tab, category tabs |
