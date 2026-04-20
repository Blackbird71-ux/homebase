import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? 'file:./homebase.db';
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
}

const prisma = createPrismaClient();

async function migrateTags() {
  console.log('Starting tag migration...');

  try {
    // Get all recipes with tags
    const recipes = await prisma.recipe.findMany({
      where: {
        AND: [
          { tags: { not: null } },
          { tags: { not: '' } }
        ]
      },
      select: {
        id: true,
        familyId: true,
        tags: true
      }
    });

    console.log(`Found ${recipes.length} recipes with tags to migrate`);

    let tagsCreated = 0;
    let recipeTagRelationsCreated = 0;
    let familiesProcessed = new Set<string>();

    // Process each recipe
    for (const recipe of recipes) {
      if (!recipe.tags) continue;

      // Split tags by comma and clean up
      const tagNames = recipe.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      if (tagNames.length === 0) continue;

      // Process each tag for this recipe
      for (const tagName of tagNames) {
        // Check if tag already exists for this family
        let tag = await prisma.tag.findFirst({
          where: {
            familyId: recipe.familyId,
            name: tagName
          }
        });

        // Create tag if it doesn't exist
        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              name: tagName,
              familyId: recipe.familyId
            }
          });
          tagsCreated++;
          familiesProcessed.add(recipe.familyId);
        }

        // Check if RecipeTag relationship already exists
        const existingRelation = await prisma.recipeTag.findFirst({
          where: {
            recipeId: recipe.id,
            tagId: tag.id
          }
        });

        // Create relationship if it doesn't exist
        if (!existingRelation) {
          await prisma.recipeTag.create({
            data: {
              recipeId: recipe.id,
              tagId: tag.id
            }
          });
          recipeTagRelationsCreated++;
        }
      }
    }

    console.log('\nMigration completed successfully!');
    console.log(`Tags created: ${tagsCreated}`);
    console.log(`RecipeTag relationships created: ${recipeTagRelationsCreated}`);
    console.log(`Families processed: ${familiesProcessed.size}`);
    console.log(`Total recipes processed: ${recipes.length}`);

    // Verify migration
    console.log('\nVerification:');
    const totalTags = await prisma.tag.count();
    const totalRecipeTags = await prisma.recipeTag.count();
    console.log(`Total tags in database: ${totalTags}`);
    console.log(`Total recipe-tag relationships: ${totalRecipeTags}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if script is executed directly
if (require.main === module) {
  migrateTags()
    .then(() => {
      console.log('Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateTags };