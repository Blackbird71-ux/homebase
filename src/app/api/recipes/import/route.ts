import { NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { parseUmamiRecipe, type UmamiJson } from '@/lib/umami-parser'
import { cacheImage, getLocalImageUrl } from '@/lib/image-cache'

export async function POST(req: Request) {
  const user = await requireSession()

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: Array<{ name: string; imported: number; updated: number; skipped: number; error?: string }> = []

  for (const file of files) {
    const bookName = file.name.replace(/\.zip$/i, '')
    let imported = 0
    let updated = 0
    let skipped = 0

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      // AdmZip works both with and without `new`; calling without `new` is
      // compatible with the vi.fn() mock pattern used in tests.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zip = (AdmZip as any)(buffer)
      const entries = zip.getEntries().filter((e: any) => e.entryName.endsWith('.json'))

      let book = await prisma.recipeBook.findFirst({
        where: { familyId: user.familyId, name: bookName },
      })
      if (!book) {
        book = await prisma.recipeBook.create({
          data: { name: bookName, familyId: user.familyId },
        })
      }

      for (const entry of entries) {
        try {
          const json = JSON.parse(entry.getData().toString('utf8')) as UmamiJson
          const parsed = parseUmamiRecipe(json, bookName)

          // Cache external image locally for faster loading
          if (parsed.image) {
            const cachedPath = await cacheImage(parsed.image)
            if (cachedPath) {
              parsed.image = `/api/images/${cachedPath}`
            }
          }

          // Try to find existing recipe by title in this book
          const existingRecipe = await prisma.recipe.findFirst({
            where: {
              familyId: user.familyId,
              bookId: book.id,
              title: parsed.title,
            },
          })

          const recipeData = {
            title: parsed.title,
            description: parsed.description,
            ingredients: JSON.stringify(parsed.ingredients),
            instructions: JSON.stringify(parsed.instructions),
            image: parsed.image,
            sourceUrl: parsed.sourceUrl,
            prepTime: parsed.prepTime,
            cookTime: parsed.cookTime,
            servings: parsed.servings,
            tags: parsed.tags.join(',') || null,
            calories: parsed.calories,
            fatContent: parsed.fatContent,
            proteinContent: parsed.proteinContent,
            carbContent: parsed.carbContent,
            sodiumContent: parsed.sodiumContent,
            bookId: book.id,
            familyId: user.familyId,
            createdBy: user.id,
          }

          if (existingRecipe) {
            // Update existing recipe - only update fields that are null/empty in DB but have values in import
            const updateData: any = {}
            
            // Check each field and only update if:
            // 1. The import has a value
            // 2. The existing field is null/empty (or we want to overwrite)
            const fieldsToUpdate = [
              'description', 'ingredients', 'instructions', 'image', 'sourceUrl',
              'prepTime', 'cookTime', 'servings', 'tags', 'calories',
              'fatContent', 'proteinContent', 'carbContent', 'sodiumContent'
            ]
            
            for (const field of fieldsToUpdate) {
              const importValue = recipeData[field as keyof typeof recipeData]
              const existingValue = existingRecipe[field as keyof typeof existingRecipe]
              
              // Only update if import has value
              if (importValue !== null && importValue !== undefined && importValue !== '') {
                // For string fields, also check if empty
                if (typeof importValue === 'string' && importValue.trim() === '') {
                  continue
                }
                // Always update prepTime, cookTime, and servings if import has values
                // (even if existing has values, to fix previously missing data)
                if (field === 'prepTime' || field === 'cookTime' || field === 'servings') {
                  updateData[field] = importValue
                } else {
                  // For other fields, only update if existing is null/empty/0
                  if (existingValue === null || existingValue === undefined ||
                      existingValue === '' || existingValue === 0) {
                    updateData[field] = importValue
                  }
                }
              }
            }
            
            // Only update if there are fields to update
            if (Object.keys(updateData).length > 0) {
              await prisma.recipe.update({
                where: { id: existingRecipe.id },
                data: updateData,
              })
              updated++
            } else {
              skipped++ // No new data to update
            }
          } else {
            // Create new recipe
            await prisma.recipe.create({
              data: recipeData,
            })
            imported++
          }
        } catch {
          skipped++
        }
      }

      results.push({ name: bookName, imported, updated, skipped })
    } catch (err) {
      results.push({ name: bookName, imported: 0, updated: 0, skipped: 0, error: String(err) })
    }
  }

  return NextResponse.json({ books: results })
}
