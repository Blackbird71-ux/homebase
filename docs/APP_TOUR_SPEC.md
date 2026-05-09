# Homebase — App Tour: Build Specification

> This is a **separate feature** from the Setup Wizard. Do not build it as part
> of the wizard. It lives in the Help system and is accessible at any time.

---

## Concept

A guided, dismissable overlay tour that walks a user through the app's sections
at their own pace. Triggered from the Help button (top-right of every page),
not on login, not automatically. The user is in control.

The existing Help button (`src/components/layout/HelpButton.tsx`) already shows
context-sensitive help for the current page. The tour is a **separate entry
point** added to the Help dialog: a "Take the tour" button that launches a
full overlay walkthrough.

---

## Where It Lives

The Help dialog already exists in `src/components/layout/HelpButton.tsx`.
Add a "Take the app tour" button to the bottom of the Help dialog (above the
Close button), visible on all pages. Clicking it launches the tour overlay.

The tour overlay renders as a portal over the app (same pattern as the existing
`Dialog` from `@/components/ui/dialog`), so it works on any page without
navigation.

---

## Tour Structure

The tour is a series of **cards** — not tooltips that point at specific DOM
elements (those are fragile). Each card is a centred modal-style panel with:
- A step indicator: "3 of 10"
- An icon + section name
- 2–3 sentences of what this section does
- "← Previous" and "Next →" buttons
- An "×" close button top-right
- A "Skip tour" link bottom-left

This approach is robust: it doesn't break if the UI changes, it works on mobile,
and it doesn't require any DOM element targeting or positioning logic.

---

## Tour Steps (10 total)

| Step | Section | Icon | What to say |
|---|---|---|---|
| 1 | Welcome | 🏠 | "Homebase is your family's command centre. This quick tour covers the main sections — takes about 2 minutes. You can stop any time." |
| 2 | Dashboard | Home | "The Dashboard is your daily view. It shows today's meals, upcoming events, shopping list status, chores due, and bills to pay. Drag and resize cards to customise it." |
| 3 | Calendar | Calendar | "Calendar keeps the whole family on the same page. Add events, set categories and colours, create recurring events, and optionally sync with Google Calendar." |
| 4 | Lists | CheckSquare | "Lists handles both shopping and to-do lists. Items are auto-sorted into categories (Produce, Dairy, Meat…) so shopping is faster. Export meal plan ingredients directly to your shopping list." |
| 5 | Chores | ListChecks | "Chores tracks recurring household tasks. Assign them to family members, set a schedule, and the dashboard shows what's due and what's overdue." |
| 6 | Recipes & Meal Plan | ChefHat | "Save recipes and build a weekly meal plan. When you plan meals, one click sends all the ingredients to your shopping list." |
| 7 | Finance | DollarSign | "Finance tracks accounts, spending, bills, budgets, and savings goals. Categories are set up automatically — just add your accounts and bills to get started." |
| 8 | Contacts & Documents | BookUser | "Contacts stores doctors, emergency numbers, schools, and tradespeople. Documents keeps important files — passports, insurance, warranties — with expiry reminders." |
| 9 | Notes | StickyNote | "Notes are shared across the family or kept private to you. Set a PIN to protect sensitive notes." |
| 10 | Settings & AI | Settings | "Settings is where you change your theme, connect Google Calendar, configure email reminders, and set up the AI assistant. The AI can control most of the app via voice or text." |

---

## Implementation Notes for the Agent

### State
```typescript
const [tourOpen, setTourOpen] = useState(false)
const [tourStep, setTourStep] = useState(0)
```

### Tour persistence
After completing or dismissing the tour, write to `localStorage`:
```typescript
localStorage.setItem('homebase-tour-seen', 'true')
```
On subsequent opens, the Help dialog shows "Retake the tour" instead of
"Take the app tour". The tour itself always starts from step 1 regardless.

### Component location
`src/components/layout/AppTour.tsx` — a self-contained client component.
Import and render it in `HelpButton.tsx`.

### Help dialog change
Add to the bottom of the Help dialog content, above the Close button:
```tsx
<div className="px-6 pb-4 border-t border-border pt-4 shrink-0">
  <Button
    variant="outline"
    size="sm"
    className="w-full"
    onClick={() => { onOpenChange(false); setTourOpen(true) }}
  >
    <MapIcon className="h-4 w-4 mr-2" />
    {tourSeen ? 'Retake the app tour' : 'Take the app tour'}
  </Button>
</div>
```

### Tour card style
```tsx
// Overlay
<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
  // Card
  <div className="bg-card text-card-foreground rounded-xl border border-border
                  shadow-xl w-full max-w-md p-6 relative">
    // Step indicator
    <p className="text-xs text-muted-foreground mb-4">Step {step + 1} of {TOUR_STEPS.length}</p>

    // Icon + title
    <div className="flex items-center gap-3 mb-3">
      <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
        <StepIcon className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">{currentStep.title}</h2>
    </div>

    // Body
    <p className="text-sm text-muted-foreground leading-relaxed">{currentStep.body}</p>

    // Navigation
    <div className="flex items-center justify-between mt-6">
      <button onClick={() => setTourOpen(false)}
        className="text-xs text-muted-foreground underline underline-offset-2">
        Skip tour
      </button>
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>
            ← Previous
          </Button>
        )}
        {step < TOUR_STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep(s => s + 1)}>
            Next →
          </Button>
        ) : (
          <Button size="sm" onClick={handleFinishTour}>
            Done ✓
          </Button>
        )}
      </div>
    </div>

    // Close button
    <button onClick={() => setTourOpen(false)}
      className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
      <X className="h-4 w-4" />
    </button>
  </div>
</div>
```

`handleFinishTour` sets `localStorage.setItem('homebase-tour-seen', 'true')` and
closes the tour.

### Progress dots (optional enhancement)
Show small dots below the body text indicating position in the tour:
```tsx
<div className="flex gap-1 justify-center mt-4">
  {TOUR_STEPS.map((_, i) => (
    <div key={i} className={cn(
      'h-1.5 rounded-full transition-all',
      i === step ? 'w-4 bg-primary' : 'w-1.5 bg-border'
    )} />
  ))}
</div>
```

---

## Files to Create / Modify

| Action | Path |
|---|---|
| CREATE | `src/components/layout/AppTour.tsx` |
| MODIFY | `src/components/layout/HelpButton.tsx` — add tour trigger button |

No API changes, no DB changes, no migration needed.
