# Finance Navigation — Grouped Tabs Plan

## Goal
Restructure the flat 18-tab navigation bar in `src/app/(app)/finance/layout.tsx` into 4 visually grouped sections with group headers.

## Groups (as specified)

| Group       | Tabs                                                                             |
|-------------|----------------------------------------------------------------------------------|
| Day-to-day  | Overview, Accounts, Transactions, Bills, Income                                  |
| Reporting   | P&L, Annual P&L, Balance Sheet, Tax Report, Journals, Reports                    |
| Planning    | Budget, Goals                                                                    |
| Reference   | Financial Contacts, Entities, Members, Locations, Chart of Accounts              |

## Visual Approach (Approach A — Multi-row Group Layout)

- The navigation container wraps groups vertically
- Each group has a small uppercase group header label above its tabs
- Group header styling: `text-xs font-semibold text-muted-foreground uppercase tracking-wide`
- Tab styling remains identical to current behavior

## Implementation Details

### 1. Restructure the `tabs` constant

Change from flat array to a grouped structure:

```typescript
const groups = [
  {
    label: 'Day-to-day',
    tabs: [
      { href: '/finance',             label: 'Overview',          exact: true },
      { href: '/finance/accounts',    label: 'Accounts',          exact: false },
      { href: '/finance/transactions',label: 'Transactions',      exact: false },
      { href: '/finance/bills',       label: 'Bills',             exact: false },
      { href: '/finance/income',      label: 'Income',            exact: false },
    ],
  },
  {
    label: 'Reporting',
    tabs: [
      { href: '/finance/profit-loss',  label: 'P&L',               exact: false },
      { href: '/finance/annual-pnl',   label: 'Annual P&L',        exact: false },
      { href: '/finance/balance-sheet',label: 'Balance Sheet',      exact: false },
      { href: '/finance/tax-report',   label: 'Tax Report',        exact: false },
      { href: '/finance/journals',     label: 'Journals',           exact: false },
      { href: '/finance/reports',      label: 'Reports',            exact: false },
    ],
  },
  {
    label: 'Planning',
    tabs: [
      { href: '/finance/budget',       label: 'Budget',             exact: false },
      { href: '/finance/goals',        label: 'Goals',              exact: false },
    ],
  },
  {
    label: 'Reference',
    tabs: [
      { href: '/finance/contacts',     label: 'Financial Contacts', exact: false },
      { href: '/finance/entities',     label: 'Entities',           exact: false },
      { href: '/finance/members',      label: 'Members',            exact: false },
      { href: '/finance/locations',    label: 'Locations',          exact: false },
      { href: '/finance/categories',   label: 'Chart of Accounts',  exact: false },
    ],
  },
]
```

### 2. Update the render JSX

Replace the current single `tabs.map(...)` with nested iteration over groups:

```tsx
<nav className="flex flex-col gap-0 min-w-max">
  {groups.map((group) => (
    <div key={group.label}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 pt-2 pb-1 block">
        {group.label}
      </span>
      <div className="flex gap-1 px-3 pb-1">
        {group.tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href) && tab.href !== '/finance'
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  ))}
</nav>
```

## Files to Modify

- `src/app/(app)/finance/layout.tsx` — only file affected

## What Remains Unchanged

- All route paths (hrefs)
- Hover/active/focus styling on tab links
- Active tab detection logic
- `exact: true` on `/finance` (Overview)
- The comment about Chart of Accounts using `/finance/categories` route
- Layout structure (h1, description, children container)
