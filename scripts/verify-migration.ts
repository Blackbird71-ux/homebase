import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? 'file:./homebase.db';
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: ['error'],
  });
}

const prisma = createPrismaClient();

async function verifyMigration() {
  console.log('Verifying database state for migration...\n');

  try {
    // Check current state
    const recipeCount = await prisma.recipe.count();
    const recipesWithTags = await prisma.recipe.count({
      where: {
        AND: [
          { tags: { not: null } },
          { tags: { not: '' } }
        ]
      }
    });

    console.log(`Total recipes: ${recipeCount}`);
    console.log(`Recipes with tags: ${recipesWithTags}`);

    // Sample some recipes with tags to see tag format
    const sampleRecipes = await prisma.recipe.findMany({
      where: {
        AND: [
          { tags: { not: null } },
          { tags: { not: '' } }
        ]
      },
      take: 5,
      select: {
        id: true,
        title: true,
        tags: true,
        familyId: true
      }
    });

    console.log('\nSample recipes with tags:');
    for (const recipe of sampleRecipes) {
      console.log(`- "${recipe.title}" (Family: ${recipe.familyId})`);
      console.log(`  Tags: "${recipe.tags}"`);
      if (recipe.tags) {
        const parsedTags = recipe.tags.split(',').map(t => t.trim()).filter(t => t);
        console.log(`  Parsed: ${JSON.stringify(parsedTags)}`);
      }
    }

    // Check new tables (should be empty before migration)
    const tagCount = await (prisma as any).tag.count().catch(() => 0);
    const recipeTagCount = await (prisma as any).recipeTag.count().catch(() => 0);

    console.log(`\nCurrent Tag table count: ${tagCount}`);
    console.log(`Current RecipeTag table count: ${recipeTagCount}`);

    // Check IngredientCategory table
    const ingredientCategories = await prisma.ingredientCategory.findMany({
      take: 5
    });
    console.log(`\nIngredientCategory records: ${ingredientCategories.length}`);
    if (ingredientCategories.length > 0) {
      console.log('Sample categories:');
      for (const cat of ingredientCategories.slice(0, 3)) {
        console.log(`- ${cat.key}: ${cat.category} (Family: ${cat.familyId})`);
      }
    }

    // Verify schema has new fields
    console.log('\nSchema verification:');
    console.log('- Tag model should have: id, name, familyId, createdAt');
    console.log('- RecipeTag model should have: recipeId, tagId, createdAt');
    console.log('- IngredientCategory should have: sortOrder, isCustom');

    console.log('\nMigration readiness:');
    if (recipesWithTags > 0) {
      console.log('✓ Recipes with tags found - migration script will process them');
    } else {
      console.log('⚠ No recipes with tags found - migration will be a no-op');
    }

    if (tagCount === 0 && recipeTagCount === 0) {
      console.log('✓ New tables are empty - ready for migration');
    } else {
      console.log('⚠ New tables already have data - ensure migration is idempotent');
    }

  } catch (error) {
    console.error('Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification if script is executed directly
if (require.main === module) {
  verifyMigration()
    .then(() => {
      console.log('\nVerification complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export { verifyMigration };