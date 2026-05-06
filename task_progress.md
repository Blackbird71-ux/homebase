# Completed Tasks

## Document viewer (Word/Excel/PDF in-app preview)
- [x] Add `mammoth` (docx) and `xlsx` (spreadsheet) dependencies
- [x] Add `DocumentViewer` component with in-app preview dialog
- [x] Add `DocumentTextEditor` component
- [x] Add API routes for document content/view (`/api/documents/[id]/content`, `/api/documents/[id]/view`)
- [x] Add "View" button to `DocumentCard.tsx`

## Recipe tag colored pills
- [x] Update `src/app/(app)/recipes/page.tsx` to fetch tag colors from DB
- [x] Update `src/app/(app)/recipes/RecipesClient.tsx` to accept and pass tagColors
- [x] Update `src/components/recipes/RecipeCard.tsx` to render tags as colored pills (rounded-full with border)

## Notes page layout
- [x] Tighten vertical padding and gaps in `NotesClient.tsx` (outer padding, section gaps, tab bar, filters)
- [x] Tighten card padding in `NoteCard.tsx` (header and content)
