-- Family-wide hide flag for recipe books (hidden books are excluded from the recipes sidebar; managed in Settings)
ALTER TABLE "RecipeBook" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
