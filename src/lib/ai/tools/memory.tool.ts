// src/lib/ai/tools/memory.tool.ts
// AI tool for recalling past meal history to inform future suggestions.
// Provides: queryMealHistory

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── queryMealHistory ──────────────────────────────────────────────────────────

const queryMealHistoryDefinition: FunctionDeclaration = {
  name: 'queryMealHistory',
  description: 'Look up what meals were cooked on past dates. Use when the user asks "what did we eat last week?", "what was for dinner last night?", "what meals did we have recently?", or "show my meal history".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      days: {
        type: SchemaType.NUMBER,
        description: 'Optional: number of days to look back (default 14)',
      },
      mealType: {
        type: SchemaType.STRING,
        description: 'Optional: filter by meal type — "breakfast", "lunch", "dinner", "snacks"',
      },
    },
  },
}

async function queryMealHistoryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { days, mealType } = args as { days?: number; mealType?: string }
  const lookBackDays = typeof days === 'number' ? days : 14

  const now = new Date()
  const start = new Date(now.getTime() - lookBackDays * 24 * 60 * 60 * 1000)

  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: start, lt: now },
      ...(mealType ? { mealType } : {}),
    },
    include: {
      recipe: { select: { title: true } },
    },
    orderBy: { date: 'desc' },
  })

  if (mealPlans.length === 0) {
    return { message: `No meal history found for the last ${lookBackDays} days.` }
  }

  // Group by date
  const byDate: Record<string, string[]> = {}
  for (const mp of mealPlans) {
    const dateKey = new Date(mp.date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
    if (!byDate[dateKey]) byDate[dateKey] = []
    const recipeName = mp.recipe?.title ?? mp.note ?? '(no recipe)'
    byDate[dateKey].push(`  ${mp.mealType}: ${recipeName}`)
  }

  const lines = Object.entries(byDate).map(([date, meals]) =>
    `**${date}**\n${meals.join('\n')}`
  )

  // Stats
  const totalMeals = mealPlans.length
  const recipeCount = new Set(mealPlans.filter(mp => mp.recipe?.title).map(mp => mp.recipe!.title)).size

  return {
    message: `**🍽️ Meal History — Last ${lookBackDays} Days**\n\n${lines.join('\n\n')}\n\n📊 ${totalMeals} meals, ${recipeCount} unique recipes`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerMemoryTools(): void {
  registerTool('queryMealHistory', {
    definition: queryMealHistoryDefinition,
    handler: queryMealHistoryHandler,
  })
}
