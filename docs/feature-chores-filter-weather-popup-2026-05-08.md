# Feature: Chore Schedule Filter & Weather Popup

**Date:** 2026-05-08

## Feature 1: Chore Schedule Filter — Show Only My Chores

### Problem

The Chore Schedule dashboard card showed all family chores by default, making it noisy for users who only want to see their own assigned tasks.

### Solution

The Chore Schedule card now defaults to showing **only chores assigned to the logged-in user**, with a toggle button to switch between "Mine" and "All" views.

### Files Changed

#### 1. `src/app/api/chores/schedule/route.ts` — API Endpoint

Added `assignedToMe` query parameter support. When `true`, filters chores by the authenticated user's `assigneeUserId`:

```typescript
// Parse optional filter for "only my chores"
const assignedToMeParam = searchParams.get('assignedToMe')
const assignedToMe = assignedToMeParam === 'true'

const chores = await prisma.chore.findMany({
  where: {
    familyId: user.familyId,
    isActive: true,
    nextDueDate: { lte: windowEnd },
    ...(assignedToMe ? { assigneeUserId: user.id } : {}),
  },
  // ...
})
```

#### 2. `src/components/dashboard/ChoreScheduleCard.tsx` — Dashboard Card

- Added `showOnlyMine` state (defaults to `true`)
- Updated `fetchSchedule` to accept and pass `onlyMine` param as `assignedToMe=true`
- Updated `useEffect` dependency to include `showOnlyMine` for re-fetching on toggle
- Added `UsersIcon` import from lucide-react
- Added toggle button between loading spinner and scope buttons:

```typescript
const [showOnlyMine, setShowOnlyMine] = useState(true)

const fetchSchedule = useCallback(async (s: ScopeDays, onlyMine: boolean) => {
    if (!timezone) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: String(s) })
      if (onlyMine) {
        params.set('assignedToMe', 'true')
      }
      const res = await fetch(`/api/chores/schedule?${params.toString()}`)
      // ...
    }
}, [timezone])

// In JSX:
<button
  type="button"
  onClick={() => setShowOnlyMine((prev) => !prev)}
  title={showOnlyMine ? 'Show all family chores' : 'Show only my chores'}
  className={`...${showOnlyMine ? 'bg-primary/10 text-primary' : 'text-muted-foreground ...'}`}>
  <UsersIcon className="h-3 w-3" />
  <span>{showOnlyMine ? 'Mine' : 'All'}</span>
</button>
```

## Feature 2: Weather Popup on Weekly Summary Card

### Problem

Users wanted a quick way to check today's weather directly from the dashboard without leaving the app.

### Solution

Added a "Weather" button to the Weekly Summary Card header that opens a popup dialog showing current conditions, fetched via GPS or a saved location setting.

### Files Added/Created

#### 1. `src/types/index.ts` — New Type

Added `WeatherData` interface for type-safe weather data:

```typescript
export interface WeatherData {
  temperature: number
  feelsLike: number
  condition: string
  icon: string
  humidity: number
  windSpeed: number
  location: string
  description: string
}
```

#### 2. `src/app/api/weather/route.ts` — API Route (NEW)

Server-side proxy to OpenWeatherMap API with:
- Session authentication via `requireSession()`
- Supports lat/lon (from GPS) or location/city name (from settings)
- Returns 503 with `needsConfig: true` if no `OPENWEATHER_API_KEY` configured
- 5-minute cache via `next: { revalidate: 300 }`
- Metric units (°C, km/h)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  await requireSession()
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const location = searchParams.get('location')

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: '...', needsConfig: true }, { status: 503 })
  }

  // Build OpenWeatherMap URL from lat/lon or location
  let url = lat && lon
    ? `https://api.openweathermap.org/data/2.5/weather?lat=...&lon=...&appid=...&units=metric`
    : `https://api.openweathermap.org/data/2.5/weather?q=...&appid=...&units=metric`

  const res = await fetch(url, { next: { revalidate: 300 } })
  const data = await res.json()

  return NextResponse.json({
    temperature: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    condition: data.weather[0]?.main ?? 'Unknown',
    description: data.weather[0]?.description ?? '',
    icon: data.weather[0]?.icon ?? '01d',
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed * 3.6),
    location: data.name,
  })
}
```

#### 3. `src/components/dashboard/WeatherDialog.tsx` — Dialog Component (NEW)

Full-featured weather popup using `@/components/ui/dialog` (Base UI primitives):

- **GPS-first**: Uses `navigator.geolocation.getCurrentPosition()` for precise location
- **Settings fallback**: If GPS denied/unavailable, reads `uiPreferences.weatherLocation` from `/api/settings`
- **States handled**: loading spinner, weather data display, GPS error, API error, needsConfig (no API key)
- **`hasAttempted` ref**: Prevents double-fetching when dialog re-renders
- **Retry button**: Available on all error states
- **Condition emoji map**: 20+ weather conditions mapped to emoji (☀️☁️🌧️⛈️❄️🌫️💨🌪️)
- **Displays**: Temperature (°C), condition emoji, description, feels-like, location, humidity (%), wind speed (km/h)

Example flow:
1. User clicks Weather button
2. Dialog opens, `useEffect` triggers `loadWeather()`
3. Browser geolocation requested
4. On success → fetch `/api/weather?lat=...&lon=...`
5. On failure → fetch `/api/settings` to get saved `weatherLocation`
6. If saved location exists → fetch `/api/weather?location=...`
7. Display weather data or error state

#### 4. `src/components/dashboard/WeeklySummaryCard.tsx` — Updated

Added weather button in header and dialog integration:

```typescript
import { CloudSun } from 'lucide-react'
import { WeatherDialog } from './WeatherDialog'

// State
const [weatherOpen, setWeatherOpen] = useState(false)

// In header (before scope buttons):
<button
  type="button"
  onClick={() => setWeatherOpen(true)}
  title="Today's weather"
  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md ...">
  <CloudSun className="h-3 w-3" />
  <span className="hidden sm:inline">Weather</span>
</button>

// Before CardContent:
<WeatherDialog open={weatherOpen} onOpenChange={setWeatherOpen} />
```

#### 5. `src/components/settings/AppearanceTab.tsx` — Weather Location Setting

Added a "Weather Location" card in Settings > Appearance:

- Text input for city name (e.g., "Sydney, AU")
- Saves to `uiPreferences.weatherLocation`
- Loads existing value from settings on mount
- Description: "Used as fallback when GPS location is unavailable"

#### 6. `env.local.example` — Environment Variable

Added `OPENWEATHER_API_KEY` with documentation pointing to https://openweathermap.org/api

## Usage

1. **Chore Filter**: Navigate to the Home dashboard. The Chore Schedule card shows only your chores by default. Click "Mine"/"All" toggle to switch views.
2. **Weather**: Click the "Weather" button on the Weekly Summary card. Allow GPS location when prompted, or set a default city in Settings > Appearance. Admin must add `OPENWEATHER_API_KEY` to `.env.local`.
