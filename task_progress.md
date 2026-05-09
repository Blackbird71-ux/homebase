# Task Progress

## Feature 1: Chore Schedule Filter
- [x] Modify chore schedule API to accept `assignedToMe` param
- [x] Update ChoreScheduleCard to filter by current user by default
- [x] Add "Show All" toggle button to show all family chores

## Feature 2: Weather Popup on WeeklySummaryCard
- [x] Create WeatherDialog component
- [x] Create `/api/weather` endpoint (uses OpenWeatherMap or browser geolocation)
- [x] Add weather button to WeeklySummaryCard
- [x] Add weather location to uiPreferences / settings
- [x] Add OPENWEATHER_API_KEY to env.example

## Finance Module — Accounting Fixes & UX Parity
- [x] P&L cash/forecast toggle (cash=confirmed only; forecast=includes pending)
- [x] Reports cash/forecast toggle (same semantics)
- [x] Budget income → single source of truth (reads FinanceIncomeEntry, retired JSON blob)
- [x] Goals auto-progress from linked account balance (disabled field when account linked)
- [x] Entity field on transactions — CRUD, filter, chip on row
- [x] Migration: 20260515000000_add_transaction_entity
- [x] Pending vs cleared balance shown on account cards
- [x] Usage counts on Categories, Members, Locations pages
- [x] Vendor description updated to mention income payers
- [x] Clickable vendor/member/location chips on bills → quick-filter badge

## Done
- [ ] Full regression test of finance module after all changes
- [ ] Commit to git once confirmed solid
