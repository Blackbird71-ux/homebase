/**
 * Import Cozi recipes from the batch-captured JSON file.
 * Run: npx tsx scripts/import-cozi-recipes-batch.ts
 *
 * Requires DATABASE_URL env var (or defaults to file:/data/homebase.db).
 */
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:/data/homebase.db',
  })
  return new PrismaClient({ adapter })
}

const prisma = createClient()

async function main() {
  const fs = await import('fs')
  const path = await import('path')
  const filePath = path.join(process.cwd(), 'docs', 'Cozie recipes.txt')
  const raw = fs.readFileSync(filePath, 'utf-8')
  const recipes: Array<{
    title: string
    ingredients: string[]
    instructions: string[]
    servings: number | null
    sourceUrl: string | null
    image: string | null
  }> = JSON.parse(raw)

  console.log(`Loaded ${recipes.length} recipes from file`)

  const user = await prisma.user.findFirst({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, familyId: true, name: true },
  })

  if (!user) {
    console.error('No admin user found.')
    process.exit(1)
  }

  console.log(`User: ${user.name} (${user.id}), family: ${user.familyId}`)

  let book = await prisma.recipeBook.findFirst({
    where: { familyId: user.familyId, name: 'Cozi Import' },
  })
  if (!book) {
    book = await prisma.recipeBook.create({
      data: { name: 'Cozi Import', familyId: user.familyId },
    })
    console.log(`Created book: ${book.name} (${book.id})`)
  } else {
    console.log(`Using existing book: ${book.name} (${book.id})`)
  }

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const recipe of recipes) {
    if (!recipe.title.trim()) {
      skipped++
      continue
    }

    const existing = await prisma.recipe.findFirst({
      where: { familyId: user.familyId, title: recipe.title.trim(), bookId: book.id },
      select: { id: true },
    })

    if (existing) {
      const updateData: Record<string, unknown> = {}
      if (recipe.ingredients.length > 0) updateData.ingredients = JSON.stringify(recipe.ingredients)
      if (recipe.instructions.length > 0) updateData.instructions = JSON.stringify(recipe.instructions)
      if (recipe.sourceUrl) updateData.sourceUrl = recipe.sourceUrl
      if (recipe.image) updateData.image = recipe.image

      if (Object.keys(updateData).length > 0) {
        await prisma.recipe.update({ where: { id: existing.id }, data: updateData })
        updated++
      } else {
        skipped++
      }
    } else {
      await prisma.recipe.create({
        data: {
          title: recipe.title.trim(),
          description: '',
          ingredients: JSON.stringify(recipe.ingredients),
          instructions: JSON.stringify(recipe.instructions),
          servings: recipe.servings ?? null,
          sourceUrl: recipe.sourceUrl ?? null,
          image: recipe.image ?? null,
          tags: null,
          bookId: book.id,
          familyId: user.familyId,
          createdBy: user.id,
        },
      })
      imported++
    }
  }

  await prisma.coziImport.create({
    data: {
      importedBy: user.id,
      familyId: user.familyId,
      eventCount: 0,
      listCount: 0,
      itemCount: imported + updated,
      notes: `Imported ${imported} new + ${updated} updated recipes from Cozi (batch)`,
    },
  })

  console.log(`\nDone: ${imported} imported, ${updated} updated, ${skipped} skipped`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
