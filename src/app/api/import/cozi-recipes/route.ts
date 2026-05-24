import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import {
  parseCoziRecipeHtml,
  parseCoziRecipeJson,
  isValidRecipe,
  formatRecipeSummary,
  type CoziRecipeData,
} from '@/lib/cozi-recipe-scraper'

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()

  const { mode, data, url, bookName } = body

  // ── Determine input mode ──────────────────────────────────────────────────
  let recipes: CoziRecipeData[] = []

  if (mode === 'html' && typeof data === 'string') {
    // Raw HTML pasted from Cozi recipe page
    const parsed = parseCoziRecipeHtml(data, url ?? null)
    if (parsed.title || parsed.ingredients.length > 0 || parsed.instructions.length > 0) {
      recipes.push(parsed)
    }
  } else if (mode === 'json' && data && typeof data === 'object') {
    // Structured JSON from the bookmarklet
    const parsed = parseCoziRecipeJson(data)
    if (parsed.title || parsed.ingredients.length > 0 || parsed.instructions.length > 0) {
      recipes.push(parsed)
    }
  } else if (mode === 'json-array' && Array.isArray(data)) {
    // Batch import from bookmarklet (multiple recipes)
    for (const item of data) {
      if (item && typeof item === 'object') {
        const parsed = parseCoziRecipeJson(item as Record<string, unknown>)
        if (parsed.title || parsed.ingredients.length > 0 || parsed.instructions.length > 0) {
          recipes.push(parsed)
        }
      }
    }
  } else if (mode === 'manual') {
    // Manual entry fields
    const ingredients = Array.isArray(body.ingredients)
      ? (body.ingredients as string[]).filter(Boolean)
      : typeof body.ingredients === 'string'
        ? (body.ingredients as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
        : []

    const instructions = Array.isArray(body.instructions)
      ? (body.instructions as string[]).filter(Boolean)
      : typeof body.instructions === 'string'
        ? (body.instructions as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
        : []

    recipes.push({
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      ingredients,
      instructions,
      prepTime: typeof body.prepTime === 'number' ? body.prepTime : null,
      cookTime: typeof body.cookTime === 'number' ? body.cookTime : null,
      servings: typeof body.servings === 'number' ? body.servings : null,
      sourceUrl: body.sourceUrl ? String(body.sourceUrl) : null,
      image: null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]).map(String).filter(Boolean) : [],
    })
  } else {
    return NextResponse.json(
      { error: 'Invalid input. Provide mode: "html", "json", "json-array", or "manual" with the appropriate data.' },
      { status: 400 }
    )
  }

  if (recipes.length === 0) {
    return NextResponse.json(
      { error: 'No recipe data could be extracted from the provided input.' },
      { status: 400 }
    )
  }

  // ── Resolve or create recipe book ─────────────────────────────────────────
  const targetBookName = bookName && typeof bookName === 'string'
    ? bookName.trim()
    : 'Cozi Import'

  let book = await prisma.recipeBook.findFirst({
    where: { familyId: user.familyId, name: targetBookName },
  })
  if (!book) {
    book = await prisma.recipeBook.create({
      data: { name: targetBookName, familyId: user.familyId },
    })
  }

  // ── Import each recipe ────────────────────────────────────────────────────
  const results: Array<{
    title: string
    imported: boolean
    updated: boolean
    skipped: boolean
    reason?: string
    summary?: string
    recipeId?: string
  }> = []

  for (const recipe of recipes) {
    if (!recipe.title.trim()) {
      results.push({
        title: '(untitled)',
        imported: false,
        updated: false,
        skipped: true,
        reason: 'No title provided',
      })
      continue
    }

    // Check for existing recipe with same title in same book
    const existing = await prisma.recipe.findFirst({
      where: {
        familyId: user.familyId,
        title: recipe.title.trim(),
        bookId: book.id,
      },
      select: { id: true, title: true },
    })

    if (existing) {
      // Update existing recipe with any new data
      const updateData: Record<string, unknown> = {}
      if (recipe.ingredients.length > 0) updateData.ingredients = JSON.stringify(recipe.ingredients)
      if (recipe.instructions.length > 0) updateData.instructions = JSON.stringify(recipe.instructions)
      if (recipe.description) updateData.description = recipe.description
      if (recipe.prepTime !== null) updateData.prepTime = recipe.prepTime
      if (recipe.cookTime !== null) updateData.cookTime = recipe.cookTime
      if (recipe.servings !== null) updateData.servings = recipe.servings
      if (recipe.sourceUrl) updateData.sourceUrl = recipe.sourceUrl

      if (Object.keys(updateData).length > 0) {
        await prisma.recipe.update({
          where: { id: existing.id },
          data: updateData,
        })
      }

      results.push({
        title: recipe.title,
        imported: false,
        updated: Object.keys(updateData).length > 0,
        skipped: Object.keys(updateData).length === 0,
        reason: Object.keys(updateData).length === 0 ? 'Already up to date' : undefined,
        recipeId: existing.id,
      })
      continue
    }

    // Create new recipe
    const created = await prisma.recipe.create({
      data: {
        title: recipe.title.trim(),
        description: recipe.description || '',
        ingredients: JSON.stringify(recipe.ingredients),
        instructions: JSON.stringify(recipe.instructions),
        prepTime: recipe.prepTime ?? null,
        cookTime: recipe.cookTime ?? null,
        servings: recipe.servings ?? null,
        sourceUrl: recipe.sourceUrl ?? null,
        image: recipe.image ?? null,
        tags: recipe.tags.length > 0 ? JSON.stringify(recipe.tags) : null,
        bookId: book.id,
        familyId: user.familyId,
        createdBy: user.id,
      },
      select: { id: true, title: true },
    })

    void createAuditLog(
      user,
      'create',
      'recipe',
      created.id,
      `Imported recipe "${recipe.title}" from Cozi`,
      { importSource: 'cozi', title: recipe.title, bookName: targetBookName }
    )

    results.push({
      title: recipe.title,
      imported: true,
      updated: false,
      skipped: false,
      summary: formatRecipeSummary(recipe),
      recipeId: created.id,
    })
  }

  // ── Log the import ────────────────────────────────────────────────────────
  const importedCount = results.filter((r) => r.imported).length
  const updatedCount = results.filter((r) => r.updated).length

  await prisma.coziImport.create({
    data: {
      importedBy: user.id,
      familyId: user.familyId,
      eventCount: 0,
      listCount: 0,
      itemCount: importedCount + updatedCount,
      notes: `Imported ${importedCount} new + ${updatedCount} updated recipes from Cozi (book: "${targetBookName}")`,
    },
  })

  return NextResponse.json({
    success: true,
    total: recipes.length,
    imported: importedCount,
    updated: updatedCount,
    skipped: results.filter((r) => r.skipped).length,
    results,
    bookName: targetBookName,
    bookId: book.id,
  })
}
