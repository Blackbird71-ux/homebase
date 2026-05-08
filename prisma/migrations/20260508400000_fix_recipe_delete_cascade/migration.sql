-- MealPlanRecipe.recipeId had ON DELETE RESTRICT, causing recipe deletion to fail
-- when the recipe was referenced in any meal plan. Change to CASCADE so those
-- meal plan entries are removed when the recipe is deleted.

PRAGMA foreign_keys=OFF;

CREATE TABLE "MealPlanRecipe_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "courseType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlanRecipe_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlanRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "MealPlanRecipe_new" SELECT * FROM "MealPlanRecipe";
DROP TABLE "MealPlanRecipe";
ALTER TABLE "MealPlanRecipe_new" RENAME TO "MealPlanRecipe";

CREATE INDEX "MealPlanRecipe_mealPlanId_order_idx" ON "MealPlanRecipe"("mealPlanId", "order");
CREATE UNIQUE INDEX "MealPlanRecipe_mealPlanId_recipeId_key" ON "MealPlanRecipe"("mealPlanId", "recipeId");

PRAGMA foreign_keys=ON;
