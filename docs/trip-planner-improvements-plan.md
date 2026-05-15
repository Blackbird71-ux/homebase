# Trip Planner — Improvement Opportunities

## ✅ Implementation Status (Completed: 15 May 2026)

### P1 — All three improvements have been implemented:

| # | Feature | Status | Key Files |
|---|---------|--------|-----------|
| 1 | **Day-by-Day Itinerary** | ✅ Done | [`ItinerarySection.tsx`](src/components/trips/ItinerarySection.tsx), [`days/route.ts`](src/app/api/trips/[id]/days/route.ts), [`[dayId]/route.ts`](src/app/api/trips/[id]/days/[dayId]/route.ts), [`activities/route.ts`](src/app/api/trips/[id]/days/[dayId]/activities/route.ts) |
| 2 | **Trip Budget & Cost Tracking** | ✅ Done | [`TripBudgetSection.tsx`](src/components/trips/TripBudgetSection.tsx), updated [`POST`](src/app/api/trips/route.ts) / [`PATCH`](src/app/api/trips/[id]/route.ts) routes |
| 3 | **Weather Forecast Integration** | ✅ Done | [`TripWeatherSection.tsx`](src/components/trips/TripWeatherSection.tsx) |

**Data model additions** ([`schema.prisma`](prisma/schema.prisma)):
- `TripDay` model with `@@unique([tripId, date])` constraint
- `TripActivity` model with category, location, time range fields
- `Trip.estimatedBudget`, `Trip.actualCost`, `Trip.budgetBreakdown`

**AI tool additions** ([`trips.tool.ts`](src/lib/ai/tools/trips.tool.ts)):
- `createTrip` now supports `estimatedBudget` and `budgetBreakdown` params
- `queryItinerary` — returns formatted day-by-day itinerary
- `updateTripItinerary` — CRUD actions for days and activities

### Remaining (P2 / P3 — not yet implemented)

| # | Feature | Priority |
|---|---------|----------|
| 4 | Calendar Integration | P2 |
| 5 | Travel Companions & Assignment | P2 |
| 6 | Trip Reminders & Countdown | P2 |
| 7 | Packing List Templates | P2 |
| 8 | Document Attachments | P2 |
| 9 | Destination Map View | P3 |
| 10 | Trip Photo Gallery | P3 |
| 11 | Trip Export / PDF | P3 |
| 12 | Trip Sharing (External) | P3 |

---

## Current State Summary

The trip planner provides a solid foundation with the following capabilities:

| Feature | Details |
|---------|---------|
| **CRUD** | Create, view, edit, and delete trips |
| **Trip Fields** | title, destination, startDate, endDate, accommodation, transport, notes, status, color, icon |
| **Statuses** | planning, confirmed, in_progress, completed, cancelled |
| **Packing List** | Linked via the shared `List` model — items support categories, assignment, toggle, edit, delete |
| **Dashboard** | UpcomingTripsCard shows next 5 upcoming trips with packing status |
| **AI Tools** | queryTrips and createTrip registered for the AI assistant |
| **List View** | TripsClient groups active vs past trips, shows packing summary per card |
| **Detail View** | TripDetailClient shows full details with inline packing list management |

### Data Model (Trip)

```prisma
model Trip {
  id            String   @id @default(cuid())
  title         String
  destination   String
  startDate     DateTime
  endDate       DateTime
  accommodation String?
  transport     String?
  notes         String?
  status        String   @default("planning")
  color         String?
  icon          String?
  packingListId String?  @unique
  packingList   List?    @relation("TripPackingList")
  createdBy     String
  familyId      String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## Proposed Improvements (Priority-Ordered)

### P1 — High Impact, Leverages Existing Infrastructure

---

#### 1. Itinerary — Day-by-Day Activity Planning

**Why:** The biggest functional gap. Currently accommodation and transport are plain text fields. A structured itinerary lets families plan each day's activities, meals, and sights.

**Changes:**
- Add `TripDay` and `TripActivity` Prisma models:

```prisma
model TripDay {
  id         String         @id @default(cuid())
  tripId     String
  trip       Trip           @relation(fields: [tripId], references: [id], onDelete: Cascade)
  date       DateTime
  label      String?
  notes      String?
  sortOrder  Int            @default(0)
  activities TripActivity[]
  createdAt  DateTime       @default(now())
}

model TripActivity {
  id        String   @id @default(cuid())
  dayId     String
  day       TripDay  @relation(fields: [dayId], references: [id], onDelete: Cascade)
  title     String
  location  String?
  startTime DateTime?
  endTime   DateTime?
  notes     String?
  category  String?
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}
```

- Add itinerary section to TripDetailClient — days auto-generated from trip date range
- Add itinerary API routes under `/api/trips/[id]/days/`
- Register `updateTripItinerary` AI tool

**Files to modify:**
- `prisma/schema.prisma` — new models + migration
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — itinerary UI section
- (New) `src/app/api/trips/[id]/days/route.ts` — CRUD for days/activities
- (New) `src/components/trips/ItinerarySection.tsx`
- `src/lib/ai/tools/trips.tool.ts` — new AI tools for itinerary
- `src/types/index.ts` — add TripDay, TripActivity types

---

#### 2. Trip Budget & Cost Tracking

**Why:** The app already has a comprehensive finance module (accounts, bills, income, P&L). Integrating trip budgets bridges travel planning with financial tracking.

**Changes:**
- Add to Trip model: `estimatedBudget` (Float?), `actualCost` (Float?), `budgetBreakdown` (String? JSON)
- Show budget progress bar on trip detail page
- Optionally link transactions/expenses to a trip via a `tripId` field

**Files to modify:**
- `prisma/schema.prisma` — budget fields on Trip
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — budget section
- (New) `src/components/trips/TripBudgetSection.tsx`
- `src/app/api/trips/[id]/route.ts` — support budget fields in PATCH
- `src/app/api/trips/route.ts` — support budget fields in POST
- `src/lib/ai/tools/trips.tool.ts` — add budget params
- `src/types/index.ts` — add budget fields to types

---

#### 3. Weather Forecast Integration

**Why:** The app already has a weather API endpoint at `/api/weather`. Showing the forecast for the trip destination during trip dates is high-value with minimal backend work.

**Changes:**
- Fetch weather forecast for trip destination on trip detail page
- Show daily forecast cards alongside the itinerary
- Cache weather data to avoid excessive API calls

**Files to modify:**
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — add weather section
- (New) `src/components/trips/TripWeatherSection.tsx`
- `src/app/api/weather/route.ts` — may need to support forecast queries
- `src/types/index.ts` — add forecast types

---

### P2 — Medium Impact, Moderate Effort

---

#### 4. Calendar Integration

**Why:** Trips are date-range events. The app has a full calendar view. Showing trips on the calendar creates a unified family schedule.

**Changes:**
- Show trip date ranges on the family calendar
- Trip badges/blocks on calendar days within the trip range
- Clicking a trip badge navigates to `/trips/{id}`

**Files to modify:**
- Calendar components in `src/components/calendar/` — add trip event rendering
- Dashboard or calendar API — include trip data in calendar queries

---

#### 5. Travel Companions & Assignment

**Why:** ListItem already has `assignedToUserId`. Packing list items can be assigned to family members, but this isn't surfaced well in the trip UI.

**Changes:**
- Show assignee avatars next to packing list items
- Filter packing list by "my items" vs "all items"
- Assign items during creation (dropdown of family members)
- Show per-person packing progress in the trip header

**Files to modify:**
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — packing list enhancements
- `src/app/(app)/trips/TripsClient.tsx` — per-trip member assignment summary

---

#### 6. Trip Reminders & Countdown

**Why:** The app has an existing reminder system. Pre-trip notifications are highly practical.

**Changes:**
- Auto-create reminders when a trip is created:
  - "Trip starts in 7 days" — reminder to pack
  - "Trip starts tomorrow" — final checklist
  - "Trip ends today" — don't forget anything
- Countdown badge on trip card (partially done)

**Files to modify:**
- `src/lib/reminders.ts` — add auto-reminder creation for trips
- `src/app/api/trips/route.ts` — trigger reminder creation on trip create
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — show countdown prominently

---

#### 7. Packing List Templates

**Why:** The `ListTemplate` model already exists with `ListTemplateItem`. Using templates for packing lists (e.g., "Beach Vacation", "Ski Trip") would save time.

**Changes:**
- Seed common packing templates or allow users to create them
- When creating a packing list, show option to start from a template
- Pre-populate items from template

**Files to modify:**
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — template selection in CreatePackingDialog
- (New) Seed script for default packing templates

---

#### 8. Document Attachments

**Why:** The app has a documents module. Trips benefit from attached documents — booking confirmations, insurance docs, passports.

**Changes:**
- Add `tripId` foreign key to document model
- Show linked documents section on trip detail page
- Quick-upload for trip documents

**Files to modify:**
- `prisma/schema.prisma` — optional `tripId` on Document model
- `src/app/(app)/trips/[id]/TripDetailClient.tsx` — documents section
- (New) `src/components/trips/TripDocumentsSection.tsx`

---

### P3 — Nice-to-Have (Lower Priority)

| # | Improvement | Description |
|---|-------------|-------------|
| 9 | Destination Map View | Show trip destinations on a static map |
| 10 | Trip Photo Gallery | Upload trip photos, create visual travelogue |
| 11 | Trip Export / PDF | Generate printable trip summary |
| 12 | Trip Sharing (External) | Share read-only trip page outside family |

---

## Priority Matrix

| # | Improvement | Effort | Impact | Dependencies |
|---|-------------|--------|--------|-------------|
| 1 | Day-by-Day Itinerary | Medium | High | Prisma migration, new components |
| 2 | Trip Budget | Medium | High | Finance module linkage |
| 3 | Weather Forecast | Low | Medium | Existing weather API |
| 4 | Calendar Integration | Low | Medium | Calendar components exist |
| 5 | Travel Companions | Low | Medium | ListItem has assignment field |
| 6 | Trip Reminders | Low | Medium | Reminder system exists |
| 7 | Packing Templates | Low | Low | ListTemplate model exists |
| 8 | Document Attachments | Medium | Low | Document module exists |

---

## Recommended Scope for Implementation Sprint

The **highest-value, lowest-effort** improvements are:

1. **Day-by-Day Itinerary** — fills the biggest functional gap
2. **Trip Budget** — leverages the finance module strength
3. **Weather Forecast** — quick win with existing API
4. **Calendar Integration** — unifies family scheduling
5. **Travel Companions** — uses existing ListItem assignment infrastructure

These five improvements would transform the trip planner from a basic itinerary tracker into a comprehensive family travel planning tool, tightly integrated with the rest of the HomeBase ecosystem.

---

## Technical Notes

- All UI components follow the existing shadcn/ui pattern with Tailwind classes
- Prisma schema changes require running `npx prisma migrate dev` for new models/fields
- `TripDetailClient.tsx` is already 886 lines — itinerary and budget sections should be extracted into separate component files
- The `ListItem` model already supports `assignedToUserId`, `category`, `dueDate`, `quantity`, `recipeId` — the packing list feature is already richer than the UI currently exposes
- No new external dependencies would be required for any of the P1 or P2 improvements
