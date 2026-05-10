// src/lib/ai/tools/meal-plan-suggest.tool.ts
// AI tool for smart recipe suggestions to fill meal plan gaps.
// Provides: suggestMeals

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── suggestMeals ──────────────────────────────────────────────────────────────

const suggestMealsDefinition: FunctionDeclaration = {
  name: 'suggestMeals',
  description: 'Suggest recipes to fill gaps in the meal plan. Use when the user asks "what should I cook this week?", "suggest some meals for the week", "I need dinner ideas", or "what recipes do you recommend?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      mealType: {
        type: SchemaType.STRING,
        description: 'Optional: filter by meal type — "breakfast", "lunch", "dinner", "snacks"',
      },
      days: {
        type: SchemaType.NUMBER,
        description: 'Optional: number of days to look ahead (default 7)',
      },
      mood: {
        type: SchemaType.STRING,
        description: 'Optional: a mood or cuisine preference like "quick", "healthy", "Italian", "comfort food", "veggie"',
      },
    },
  },
}

async function suggestMealsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { mealType, days, mood } = args as { mealType?: string; days?: number; mood?: string }
  const lookAheadDays = typeof days === 'number' ? days : 7

  // Determine the date range
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endDate = new Date(today)
  endDate.setDate(today.getDate() + lookAheadDays)

  // 1. Find meal plan gaps — days/mealTypes without a recipe
  const existingPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: today, lt: endDate },
      ...(mealType ? { mealType } : {}),
    },
    select: { date: true, mealType: true },
  })

  const filledSlots = new Set(existingPlans.map(p => `${p.date.toISOString().slice(0, 10)}-${p.mealType}`))

  const mealTypes = mealType ? [mealType] : ['breakfast', 'lunch', 'dinner']
  const gapSlots: Array<{ date: Date; label: string; mealType: string }> = []

  for (let d = new Date(today); d < endDate; d.setDate(d.getDate() + 1)) {
    for (const mt of mealTypes) {
      const key = `${d.toISOString().slice(0, 10)}-${mt}`
      if (!filledSlots.has(key)) {
        gapSlots.push({
          date: new Date(d),
          label: d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }),
          mealType: mt,
        })
      }
    }
  }

  // 2. Get all recipes for suggestions
  const recipes = await prisma.recipe.findMany({
    where: { familyId: ctx.familyId },
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      prepTime: true,
      cookTime: true,
      servings: true,
      image: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (recipes.length === 0) {
    return { message: 'No recipes in your collection. Add some recipes first and I can help plan your meals!' }
  }

  // 3. Check meal history — what was cooked recently in these slots?
  const recentMeals = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000), lt: today },
      ...(mealType ? { mealType } : {}),
    },
    select: { recipeId: true, mealType: true },
  })
  const recentRecipeIds = new Set(recentMeals.map(m => m.recipeId).filter(Boolean))

  // 4. Score and sort recipes
  const scored = recipes.map(r => {
    let score = 0

    // Prefer recipes not recently used
    if (!recentRecipeIds.has(r.id)) score += 3

    // Parse tags
    const tags = r.tags ? r.tags.split(',').map(t => t.trim().toLowerCase()) : []

    // Match mood/cuisine preference
    if (mood) {
      const moodLower = mood.toLowerCase()
      if (tags.some(t => t.includes(moodLower))) score += 5
      if (r.description?.toLowerCase().includes(moodLower)) score += 3
      if (r.title.toLowerCase().includes(moodLower)) score += 4
    }

    // Prefer recipes with shorter prep time for "quick" mood
    if (mood?.toLowerCase().includes('quick') && r.prepTime && r.prepTime <= 15) score += 3
    if (mood?.toLowerCase().includes('healthy') && tags.some(t => ['healthy', 'vegetarian', 'vegan', 'salad', 'low-calorie', 'low-fat'].includes(t))) score += 5

    return { recipe: r, tags, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const topSuggestions = scored.slice(0, 8)

  // 5. Build the response
  if (gapSlots.length === 0) {
    // All slots filled — just suggest new recipes
    const lines = topSuggestions.map(r => {
      const timeParts = []
      if (r.recipe.prepTime) timeParts.push(`${r.recipe.prepTime}m prep`)
      if (r.recipe.cookTime) timeParts.push(`${r.recipe.cookTime}m cook`)
      const timeStr = timeParts.length > 0 ? ` (${timeParts.join(', ')})` : ''
      const desc = r.recipe.description ? ` — ${r.recipe.description.slice(0, 100)}` : ''
      return `  • ${r.recipe.title}${timeStr}${desc}`
    })
    return {
      message: `**🍳 Recipe Suggestions**${mood ? ` (${mood})` : ''}\n\nYour meal plan is full for the next ${lookAheadDays} days, but here are some recipes to try next time:\n${lines.join('\n')}`,
    }
  }

  // Map suggestions to gap slots
  const gapLines = gapSlots.slice(0, 10).map((slot, i) => {
    const suggestion = topSuggestions[i % topSuggestions.length]
    const timeParts = []
    if (suggestion.recipe.prepTime) timeParts.push(`${suggestion.recipe.prepTime}m prep`)
    if (suggestion.recipe.cookTime) timeParts.push(`${suggestion.recipe.cookTime}m cook`)
    const timeStr = timeParts.length > 0 ? ` [${timeParts.join(', ')}]` : ''
    return `  📅 ${slot.label} (${slot.mealType}): ${suggestion.recipe.title}${timeStr}`
  })

  // Show all top suggestions available
  const suggestionLines = topSuggestions.map(r => {
    const timeParts = []
    if (r.recipe.prepTime) timeParts.push(`${r.recipe.prepTime}m prep`)
    if (r.recipe.cookTime) timeParts.push(`${r.recipe.cookTime}m cook`)
    const timeStr = timeParts.length > 0 ? ` (${timeParts.join(', ')})` : ''
    const desc = r.recipe.description ? ` — ${r.recipe.description.slice(0, 100)}` : ''
    return `  • ${r.recipe.title}${timeStr}${desc}`
  })

  return {
    message: `**🍳 Meal Suggestions**${mood ? ` (${mood})` : ''}\n\nI found ${gapSlots.length} open slot(s) in your meal plan. Here are my suggestions:\n\n${gapLines.join('\n')}\n\n**Available recipes:**\n${suggestionLines.join('\n')}\n\n💡 Tell me which ones to add and I\'ll update your meal plan!`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerMealPlanSuggestTools(): void {
  registerTool('suggestMeals', {
    definition: suggestMealsDefinition,
    handler: suggestMealsHandler,
  })
}
