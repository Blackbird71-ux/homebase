# Contacts: Category Tabs + Responsive Grid

## Changes Made

**File:** [`src/app/(app)/contacts/ContactsClient.tsx`](../src/app/(app)/contacts/ContactsClient.tsx)

### 1. Category Tabs (replaces vertical stacked sections)

Categories are now rendered as **horizontal tabs** using the existing `Tabs` component from `@/components/ui/tabs`. Each category with contacts gets a tab, plus an **"All"** tab showing every contact. The tab bar is horizontally scrollable (`overflow-x-auto`) for when many categories exist.

### 2. Responsive Card Grid (more columns on large screens)

The contact card grid now scales from 1 column on mobile up to 6 columns on ultra-wide displays:

```tsx
grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6
```

Previously capped at `grid-cols-1 md:grid-cols-2`.

### 3. Code extraction

The card rendering was extracted into a `renderContactCard()` function and the grid into `renderGrid()` for cleaner JSX.

## Details

- `activeTab` state defaults to `'all'`
- `contactsForTab(tabValue)` filters contacts for the active tab
- Tab triggers show category label and contact count
- Category colour classes (`text-pink-500`, etc.) are preserved on tab triggers
- Empty state (no contacts) still renders without tabs
