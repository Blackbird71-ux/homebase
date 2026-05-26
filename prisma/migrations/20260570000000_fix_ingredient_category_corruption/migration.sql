-- Fix ingredient category corruption caused by the /learn API incorrectly
-- setting isCustom=true on keyword mapping records.
--
-- Keyword mappings that were promoted have:
--   - isCustom = 1 (true)
--   - key that does NOT start with 'system_' (system display categories)
--   - key that does NOT start with 'custom_'  (user-created inline categories)
--   - category matching one of the 7 system defaults
--
-- Resetting these to isCustom=false makes the API filter exclude them again,
-- eliminating duplicate category names in the shopping list and settings page.
UPDATE "IngredientCategory"
SET "isCustom" = 0
WHERE "isCustom" = 1
  AND "key" NOT LIKE 'system_%'
  AND "key" NOT LIKE 'custom_%'
  AND "category" IN ('Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen', 'Household', 'Other');
