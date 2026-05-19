-- AddColumn: Recipe.isFavourite
ALTER TABLE "Recipe" ADD COLUMN "isFavourite" BOOLEAN NOT NULL DEFAULT false;
