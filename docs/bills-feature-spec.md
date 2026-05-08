# Bills Page Enhancement — Feature Specification

**Project:** Homepage Finance App  
**Location:** `c:\appdev\homepage`  
**Feature Area:** Bills  
**Date:** 2026-05-08  

---

## Overview

This document specifies four enhancements to the Bills section of the finance homepage app:

1. **Invoice Received** — ability to mark that an invoice has arrived for a bill
2. **Mark as Paid** — ability to mark a bill as paid
3. **Paid Bills Page** — paid bills move off the main Bills page to a dedicated Paid Bills page
4. **Bill Type Icons** — visual icons and recurrence labels distinguishing one-off vs recurring bills

---

## 1. Data Model Changes

Each bill object must be extended with the following new fields. Apply these changes wherever bills are stored (database, JSON file, state store, etc.).

```
bill {
  // --- existing fields (unchanged) ---
  id
  name
  amount
  dueDate
  category
  notes

  // --- NEW fields ---
  billType        : "one-off" | "recurring"
  recurrenceInterval : "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually" | null
                    // null when billType === "one-off"

  invoiceReceived : boolean          // default: false
  invoiceReceivedDate : date | null  // date invoice was marked received; null if not yet received

  paid            : boolean          // default: false
  paidDate        : date | null      // date bill was marked paid; null if not yet paid
}
```

**Migration:** For all existing bills, set `billType = "recurring"`, `recurrenceInterval = "monthly"`, `invoiceReceived = false`, `invoiceReceivedDate = null`, `paid = false`, `paidDate = null`. Adjust defaults to match your actual data if known.

---

## 2. Bills Page (Active Bills)

### 2.1 Filtering

- The Bills page must **only display bills where `paid === false`**.
- Bills where `paid === true` must not appear here at all — they live on the Paid Bills page.

### 2.2 Bill Card / Row Layout

Each bill on the Bills page displays the following, reading left to right:

```
[ Bill Type Icon ]  [ Bill Name ]  [ Recurrence Label ]     [ Amount ]  [ Invoice Badge ]  [ Mark Paid Button ]
```

#### Bill Type Icon

| Condition | Icon | Suggested icon (use your icon library) |
|-----------|------|----------------------------------------|
| `billType === "one-off"` | Single document / receipt | `FileText`, `Receipt`, or `DocumentSingle` |
| `billType === "recurring"` | Refresh / repeat / cycle arrows | `RefreshCw`, `Repeat`, or `ArrowsRotate` |

- Icon size: 20–24 px
- One-off icon colour: neutral (grey-500 or similar)
- Recurring icon colour: brand accent or blue-500

#### Recurrence Label

- Shown only when `billType === "recurring"`.
- Displayed as a small pill/badge directly beside or below the bill name.
- Text values:

| `recurrenceInterval` value | Label shown |
|---------------------------|-------------|
| `weekly`                   | Weekly      |
| `fortnightly`              | Fortnightly |
| `monthly`                  | Monthly     |
| `quarterly`                | Quarterly   |
| `annually`                 | Annually    |

- Badge style: subtle background (e.g. blue-100 / blue-800 text), small font (text-xs), rounded-full.
- One-off bills show no recurrence badge.

#### Invoice Received Badge / Button

Two states:

| `invoiceReceived` | Display |
|-------------------|---------|
| `false` | Show a ghost/outline button labelled **"Invoice Received"** (or a small envelope + tick icon). Clicking sets `invoiceReceived = true` and `invoiceReceivedDate = today`. |
| `true` | Replace the button with a static green badge: ✓ **Invoice Received** with the date underneath in small text (e.g. "Received 5 May 2026"). No further action needed on this badge. |

- Do **not** require invoice received before allowing mark paid — they are independent actions.

#### Mark Paid Button

- Always visible while a bill is unpaid.
- Label: **"Mark Paid"** (or a tick/check icon button).
- On click:
  - Show a **confirmation prompt** (modal or inline confirm): *"Mark [Bill Name] as paid?"* with **Confirm** and **Cancel** options.
  - On Confirm: set `paid = true`, `paidDate = today`, then **remove the bill from the active Bills page** and add it to Paid Bills.
  - On Cancel: do nothing.
- Button style: primary or success colour (green).

### 2.3 Add / Edit Bill Form

The Add Bill and Edit Bill forms must include the following new fields:

#### Bill Type (required)

- Radio buttons or a segmented toggle:
  - 🗂 **One-off** — single payment, no recurrence
  - 🔁 **Recurring** — repeating on a schedule

#### Recurrence Interval (conditional — shown only when Recurring is selected)

- Dropdown / select field with options:
  - Weekly
  - Fortnightly
  - Monthly *(default)*
  - Quarterly
  - Annually

#### Invoice Received (optional, checkbox)

- Checkbox: **"Invoice already received"**
- If checked, also capture `invoiceReceivedDate` (date picker, defaults to today).
- Useful when adding a bill that already has its invoice in hand.

---

## 3. Paid Bills Page

### 3.1 Navigation

- Add a navigation link/tab labelled **"Paid Bills"** alongside the existing "Bills" link.
- Suggested icon for the nav item: `CheckCircle` or `CircleCheck`.

### 3.2 Page Layout

- Page title: **Paid Bills**
- Subtitle / summary line: *"X bills paid totalling $Y"* (dynamic count and sum).
- Default sort: **paidDate descending** (most recently paid first).
- Optional: provide a filter bar to filter by month/year or category.

### 3.3 Paid Bill Row Layout

Each row shows:

```
[ Bill Type Icon ]  [ Bill Name ]  [ Recurrence Label ]  [ Amount ]  [ Invoice Badge ]  [ Paid Date ]  [ Undo Button ]
```

- **Bill Type Icon** and **Recurrence Label** — same as active Bills page.
- **Invoice Badge** — same green ✓ badge if `invoiceReceived === true`; blank/absent if not.
- **Paid Date** — display `paidDate` formatted as a readable date (e.g. "Paid 6 May 2026").
- **Undo Button** — a small secondary/ghost button labelled **"Undo"** or with an undo icon.
  - On click: show confirmation *"Move [Bill Name] back to active bills?"*
  - On Confirm: set `paid = false`, `paidDate = null`, move bill back to the active Bills page.

### 3.4 Empty State

When no bills have been paid yet, display a friendly empty state:

> *No paid bills yet. Paid bills will appear here once you mark them as paid.*

---

## 4. Summary / Behaviour Rules

| Action | Result |
|--------|--------|
| Mark invoice received | `invoiceReceived = true`, `invoiceReceivedDate = today`. Button replaced by green badge. Bill stays active. |
| Mark paid (confirmed) | `paid = true`, `paidDate = today`. Bill disappears from Bills page, appears on Paid Bills page immediately. |
| Undo paid (confirmed) | `paid = false`, `paidDate = null`. Bill reappears on Bills page, removed from Paid Bills page. |
| Add bill as one-off | `billType = "one-off"`, `recurrenceInterval = null`. One-off icon shown, no recurrence badge. |
| Add bill as recurring | `billType = "recurring"`, `recurrenceInterval` = chosen interval. Recurring icon + interval badge shown. |

---

## 5. Visual Reference — Icon & Badge Summary

```
ACTIVE BILLS PAGE

┌─────────────────────────────────────────────────────────────────────────────┐
│  🔁  Electricity       [Monthly]      $180.00   [✓ Invoice Received        ] │
│                                                  Received 2 May 2026         │
│                                                  [  Mark Paid  ]             │
├─────────────────────────────────────────────────────────────────────────────┤
│  🔁  Internet          [Monthly]      $89.00    [ Invoice Received ]         │
│                                                  [  Mark Paid  ]             │
├─────────────────────────────────────────────────────────────────────────────┤
│  📄  Car Registration  (one-off)      $920.00   [✓ Invoice Received        ] │
│                                                  Received 1 May 2026         │
│                                                  [  Mark Paid  ]             │
└─────────────────────────────────────────────────────────────────────────────┘

PAID BILLS PAGE

┌─────────────────────────────────────────────────────────────────────────────┐
│  🔁  Water             [Quarterly]    $210.00   ✓ Invoice Received   Paid 3 May 2026   [Undo] │
├─────────────────────────────────────────────────────────────────────────────┤
│  📄  Parking Fine      (one-off)      $165.00                        Paid 28 Apr 2026  [Undo] │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Notes for the Agent

- **State management:** When `paid` is toggled, re-filter the bills list reactively so the card animates out of the active list and into the paid list without a full page reload.
- **Persistence:** Persist all new fields (`billType`, `recurrenceInterval`, `invoiceReceived`, `invoiceReceivedDate`, `paid`, `paidDate`) to whatever storage layer is already in use (localStorage, file, database).
- **Confirmation dialogs:** Both "Mark Paid" and "Undo" require a confirmation step to prevent accidental state changes.
- **Date formatting:** Use a consistent human-readable date format across the app (e.g. "D MMM YYYY").
- **Accessibility:** Icon-only buttons must have `aria-label` text. The recurrence badge must not be the sole source of information — include it in the bill's accessible name or as a visible label.
- **Responsive layout:** On narrow screens, stack the invoice badge and mark-paid button below the bill name/amount row.
- **No deletion:** "Mark Paid" does not delete a bill — it moves it. All history is retained on the Paid Bills page.

---

*End of specification.*
