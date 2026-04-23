-- CreateTable
CREATE TABLE "MealPlanRecipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "courseType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlanRecipe_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlanRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MealPlanRecipe_mealPlanId_order_idx" ON "MealPlanRecipe"("mealPlanId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanRecipe_mealPlanId_recipeId_key" ON "MealPlanRecipe"("mealPlanId", "recipeId");
