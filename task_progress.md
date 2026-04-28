# Implementation Progress

## Features Implemented

### 1. Meal Plan Templates (Save/Apply weekly templates)
- [x] Schema: MealPlanTemplate + MealPlanTemplateSlot models
- [x] Migration applied
- [x] API: GET /api/meal-plan/templates - list templates
- [x] API: POST /api/meal-plan/templates - create template from week
- [x] API: GET /api/meal-plan/templates/[id] - get template with slots
- [x] API: DELETE /api/meal-plan/templates/[id] - delete template
- [x] API: POST /api/meal-plan/templates/[id] - apply template to week
- [x] UI: Save Template button + dialog in MealPlanGrid
- [x] UI: Apply Template button + template selector in MealPlanGrid

### 2. Recipe Scaling (Multiply/halve ingredient quantities)
- [x] UI: Scale buttons (0.5x, 1x, 1.5x, 2x, 3x) in RecipeDetail
- [x] Logic: Parse ingredient quantities and scale them

### 3. Shopping List Price Estimates
- [x] Schema: unitPrice + quantity fields on ListItem
- [x] UI: Unit price & quantity fields in EditItemDialog
- [x] UI: Price subtotals per category in CategoryGroup
- [x] API: unitPrice/quantity handled in POST and PATCH routes

### 4. Recipe Nutritional Display
- [x] NutritionPanel component with calories, fat, protein, carbs, sodium
- [x] Integrated in RecipeDetail

### 5. Event Attendance / RSVP
- [x] Schema: EventAttendee model
- [x] API: POST /api/events/[id]/attendees - set attendance
- [x] API: GET /api/events/[id]/attendees - get attendees
- [x] UI: RSVP controls (Going/Maybe/No) in EventModal via EventAttendeePanel

### 6. Shopping List Subtotals by Category
- [x] UI: Item counts per category in CategoryGroup
- [x] UI: Price subtotals per category (when unitPrice is set)
