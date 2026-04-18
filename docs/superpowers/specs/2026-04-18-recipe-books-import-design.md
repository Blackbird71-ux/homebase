# Recipe Books & Umami Import — Design Spec

## Goal

Add recipe book collections to the Recipes page, and allow bulk import of Umami-exported zip files so Michelle's 181 recipes across 11 books can be brought into HomeBase.

## Architecture

A new `RecipeBook` table stores per-family named collections. `Recipe` gains an optional `bookId`. The Recipes page gets a sidebar showing All Recipes + each book. Import accepts multiple zip files, creates books from zip filenames, and maps Umami's schema.org JSON format to HomeBase recipes. A separate import UI lives in Settings for the initial bulk load.

## Tech Stack

Next.js 16 App Router, Prisma 7 + better-sqlite3, NextAuth v5, Vitest, Tailwind v4, shadcn/ui, `adm-zip` (new dependency — `npm install adm-zip` + `npm install -D @types/adm-zip`) for zip parsing in API routes.

---

## Data Model

### New model: RecipeBook

```prisma
model RecipeBook {
  id        String   @id @default(cuid())
  name      String
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  recipes   Recipe[]
  createdAt DateTime @default(now())

  @@unique([familyId, name])
}
```

Add to `Family`:
```prisma
recipeBooks RecipeBook[]
```

### Recipe changes

Add optional relation:
```prisma
bookId    String?
book      RecipeBook? @relation(fields: [bookId], references: [id])
```

Existing recipes get `bookId = null` — visible under "All Recipes".

---

## Umami JSON → HomeBase Field Mapping

| Umami field | HomeBase field | Transform |
|---|---|---|
| `name` | `title` | Direct |
| `url` | `sourceUrl` | Direct |
| `image[0]` | `image` | First URL as-is |
| `description` | `description` | Direct (optional) |
| `recipeIngredient` | `ingredients` | `JSON.stringify(array)` |
| `recipeInstructions[].text` | `instructions` | Join with `\n` |
| `prepTime` | `prepTime` | ISO 8601 → minutes (see below) |
| `cookTime` | `cookTime` | ISO 8601 → minutes |
| `recipeYield` | `servings` | Parse int from "2 servings" → 2 |
| `keywords` | `tags` | Split by comma, trim, remove recipe name + book name, dedupe |

### ISO 8601 duration → minutes

`P0Y0M0DT0H10M0S` → extract hours (`0`) × 60 + minutes (`10`) = `10`. Zero stays as `null`.

### Tags from keywords

`"Mushroom Pasta, Vegetarian, RECIPES"` → split → remove first element (= recipe name) → remove element matching book name → `["Vegetarian"]`.

---

## API Routes

### `GET /api/recipe-books`
Returns all books for the session's family: `{ id, name, recipeCount }[]`.

### `POST /api/recipe-books`
Body: `{ name: string }`. Creates a new book. Returns `{ id, name }`.

### `DELETE /api/recipe-books/[id]`
Deletes the book. Recipes in the book have `bookId` set to `null` (not deleted).

### `POST /api/recipes/import`
- Accepts `multipart/form-data` with one or more `files` fields (zip files)
- For each zip:
  - Book name = zip filename without `.zip` extension
  - Find or create `RecipeBook` with that name for the family
  - For each `.json` file in the zip:
    - Parse as Umami schema.org Recipe JSON
    - Skip if a recipe with the same `title` already exists in the same book
    - Map fields and create `Recipe`
- Returns `{ books: [{ name, created, imported, skipped }] }`

### `PATCH /api/recipes/[id]`
Already exists — extend to accept `bookId` in the body (nullable).

---

## UI

### Recipes page — sidebar

- Left sidebar on desktop (collapsible, ~200px wide)
- Horizontal scroll tabs on mobile (below page header)
- Items: **All Recipes** (no filter) + each book sorted alphabetically, each showing recipe count badge
- Active book is highlighted; clicking sets the active book filter
- Search and tag filter chips apply within the active book
- **+ New Book** button at bottom of sidebar — inline name input, creates book via API
- No rename in v1

### Recipe card / form

- Recipe form (create + edit) gets a **Book** dropdown field: options are all family books + "No book"
- On create, if a book is active in the sidebar, it pre-selects that book
- Saving a recipe with a book sets `bookId`

### Import modal (Recipes page)

Triggered by **Import** button (upload icon) in the Recipes page header.

1. File picker: accepts `.zip`, multiple files allowed
2. Shows list of selected files with filename
3. **Import** button — calls `POST /api/recipes/import`
4. Progress: spinner per file while uploading
5. Summary on completion: table of books with "imported / skipped" counts
6. Error per file if zip is malformed

### Settings — Import tab

Admin-only tab in Settings (alongside Integrations). Contains the same import modal UI — useful for the initial bulk import of all 11 books without navigating to Recipes first.

---

## Duplicate Handling

A recipe is considered a duplicate if a recipe with the same `title` (case-insensitive) already exists in the same `RecipeBook` for the family. Duplicates are skipped and counted in the summary. Recipes with the same name in different books are allowed.

---

## Files

| Action | Path |
|---|---|
| Modify | `prisma/schema.prisma` |
| Create | `src/lib/umami-parser.ts` |
| Create | `src/lib/__tests__/umami-parser.test.ts` |
| Create | `src/app/api/recipe-books/route.ts` |
| Create | `src/app/api/recipe-books/__tests__/route.test.ts` |
| Create | `src/app/api/recipe-books/[id]/route.ts` |
| Create | `src/app/api/recipes/import/route.ts` |
| Create | `src/app/api/recipes/import/__tests__/route.test.ts` |
| Modify | `src/app/api/recipes/[id]/route.ts` |
| Create | `src/components/recipes/RecipeBookSidebar.tsx` |
| Create | `src/components/recipes/ImportModal.tsx` |
| Modify | `src/components/recipes/RecipeForm.tsx` |
| Modify | `src/app/(app)/recipes/RecipesClient.tsx` |
| Modify | `src/app/(app)/recipes/page.tsx` |
| Create | `src/components/settings/ImportTab.tsx` |
| Modify | `src/app/(app)/settings/page.tsx` |
