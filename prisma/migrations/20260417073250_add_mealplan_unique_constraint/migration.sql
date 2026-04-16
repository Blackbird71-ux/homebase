-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_familyId_date_mealType_key" ON "MealPlan"("familyId", "date", "mealType");
