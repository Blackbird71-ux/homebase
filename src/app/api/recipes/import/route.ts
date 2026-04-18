import { NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { parseUmamiRecipe, type UmamiJson } from '@/lib/umami-parser'

export async function POST(req: Request) {
  const user = await requireSession()

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: Array<{ name: string; imported: number; skipped: number; error?: string }> = []

  for (const file of files) {
    const bookName = file.name.replace(/\.zip$/i, '')
    let imported = 0
    let skipped = 0

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      // AdmZip works both with and without `new`; calling without `new` is
      // compatible with the vi.fn() mock pattern used in tests.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zip = (AdmZip as any)(buffer)
      const entries = zip.getEntries().filter((e) => e.entryName.endsWith('.json'))

      let book = await prisma.recipeBook.findFirst({
        where: { familyId: user.familyId, name: bookName },
      })
      if (!book) {
        book = await prisma.recipeBook.create({
          data: { name: bookName, familyId: user.familyId },
        })
      }

      const existingRows = await prisma.recipe.findMany({
        where: { familyId: user.familyId, bookId: book.id },
        select: { title: true },
      })
      const existingTitles = new Set(existingRows.map((r) => r.title.toLowerCase()))

      for (const entry of entries) {
        try {
          const json = JSON.parse(entry.getData().toString('utf8')) as UmamiJson
          const parsed = parseUmamiRecipe(json, bookName)

          if (existingTitles.has(parsed.title.toLowerCase())) {
            skipped++
            continue
          }
          existingTitles.add(parsed.title.toLowerCase())

          await prisma.recipe.create({
            data: {
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
              bookId: book.id,
              familyId: user.familyId,
              createdBy: user.id,
            },
          })
          imported++
        } catch {
          skipped++
        }
      }

      results.push({ name: bookName, imported, skipped })
    } catch (err) {
      results.push({ name: bookName, imported: 0, skipped: 0, error: String(err) })
    }
  }

  return NextResponse.json({ books: results })
}
