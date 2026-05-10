// src/lib/ai/tools/meal-plan.tool.ts
// AI tool registrations for meal plan operations.
// Provides: addRecipeToMealPlan, clearMealPlanSlot, queryMealPlan, generateShoppingList

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { resolveDayToDate, safeParseStringArray } from '@/lib/ai/orchestrator'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────
// Provides the AI with available recipes, current week's meal plan, and active
// shopping lists (needed so the AI can resolve recipe names to IDs and know
// what's already planned).

async function mealPlanContextProvider(familyId: string, _userId: string): Promise<string> {
  const timezone = 'UTC' // Will be overridden in system prompt preamble

  // Recipes
  const recipes = await prisma.recipe.findMany({
    where: { familyId },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  })
  const recipeList = recipes.map(r => `"${r.title}" (id: ${r.id})`).join('\n')

  // Current week's meal plan
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { format, addDays, parseISO } = require('date-fns')
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId,
      date: { gte: new Date(nowStr), lte: new Date(weekEndStr + 'T23:59:59Z') },
    },
    include: {
      recipes: { include: { recipe: { select: { title: true } } }, orderBy: { order: 'asc' } },
    },
    orderBy: { date: 'asc' },
  })

  const mealPlanSummary = mealPlans.length > 0
    ? mealPlans.map(p => {
        const dateLabel = new Date(p.date).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
        const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
        return `${dateLabel} ${p.mealType}: ${recipeTitles || '(empty)'}`
      }).join('\n')
    : 'No meals planned this week yet.'

  // Active shopping lists
  const shoppingLists = await prisma.list.findMany({
    where: { familyId, isActive: true, type: 'SHOPPING' },
    select: { id: true, name: true },
    take: 5,
  })
  const shoppingListSummary = shoppingLists.length > 0
    ? shoppingLists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'

  return [
    `Available recipes in the family's recipe collection:\n${recipeList || '(none yet)'}\n`,
    `Active shopping lists: ${shoppingListSummary}`,
    `Current week's meal plan:\n${mealPlanSummary}`,
  ].join('\n\n')
}

// ── addRecipeToMealPlan ───────────────────────────────────────────────────────

const addRecipeDefinition: FunctionDeclaration = {
  name: 'addRecipeToMealPlan',
  description: 'Add a recipe to the meal plan on a specific date and meal type (breakfast, lunch, dinner, snacks). Use this when the user says things like "add X to Monday dinner" or "put pasta on Tuesday lunch".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      recipeId: { type: SchemaType.STRING, description: 'The ID of the recipe to add' },
      date: { type: SchemaType.STRING, description: 'ISO date string (YYYY-MM-DD) for the meal plan day' },
      mealType: { type: SchemaType.STRING, description: 'One of: breakfast, lunch, dinner, snacks' },
    },
    required: ['recipeId', 'date', 'mealType'],
  },
}

async function addRecipeHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { recipeId, date, mealType } = args as { recipeId: string; date: string; mealType: string }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, familyId: ctx.familyId },
    select: { title: true },
  })
  if (!recipe) {
    return { message: 'Recipe not found.' }
  }

  const normalized = new Date(date + 'T00:00:00Z')
  const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })

  const plan = await prisma.mealPlan.upsert({
    where: { familyId_date_mealType: { familyId: ctx.familyId, date: normalized, mealType } },
    create: { date: normalized, mealType, familyId: ctx.familyId, recipeId },
    update: { recipeId },
  })
  await prisma.mealPlanRecipe.deleteMany({ where: { mealPlanId: plan.id } })
  await prisma.mealPlanRecipe.create({
    data: { mealPlanId: plan.id, recipeId, order: 0 },
  })

  return {
    message: `${recipe.title} added to ${dayLabel} ${mealType}.`,
    action: 'addRecipeToMealPlan',
  }
}

// ── clearMealPlanSlot ─────────────────────────────────────────────────────────

const clearSlotDefinition: FunctionDeclaration = {
  name: 'clearMealPlanSlot',
  description: 'Remove a meal from the meal plan for a specific day and meal type. Use this when the user says "remove dinner on Monday", "clear Tuesday lunch", or "delete the meal on Wednesday".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date: { type: SchemaType.STRING, description: 'ISO date string (YYYY-MM-DD)' },
      mealType: { type: SchemaType.STRING, description: 'One of: breakfast, lunch, dinner, snacks' },
    },
    required: ['date', 'mealType'],
  },
}

async function clearSlotHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { date, mealType } = args as { date: string; mealType: string }
  const normalized = new Date(date + 'T00:00:00Z')
  const existing = await prisma.mealPlan.findFirst({
    where: { familyId: ctx.familyId, date: normalized, mealType },
  })
  if (!existing) {
    const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    return { message: `No ${mealType} planned for ${dayLabel}.` }
  }
  await prisma.mealPlan.delete({ where: { id: existing.id } })
  const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
  return {
    message: `${dayLabel} ${mealType} cleared.`,
    action: 'clearMealPlanSlot',
  }
}

// ── queryMealPlan ─────────────────────────────────────────────────────────────

const queryDefinition: FunctionDeclaration = {
  name: 'queryMealPlan',
  description: "Look up what meals are planned for the current week or a specific day. Use this when the user asks \"what's for dinner?\" or \"what's planned this week?\".",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      day: { type: SchemaType.STRING, description: 'Optional: day name like "Monday" or "today" to query a specific day. Omit to get the full week.' },
    },
  },
}

async function queryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = 'UTC'
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { format, addDays, parseISO } = require('date-fns')
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: new Date(nowStr), lte: new Date(weekEndStr + 'T23:59:59Z') },
    },
    include: {
      recipes: { include: { recipe: { select: { title: true } } }, orderBy: { order: 'asc' } },
    },
    orderBy: { date: 'asc' },
  })

  const { day } = args as { day?: string }
  if (day) {
    const targetDate = resolveDayToDate(day, timezone)
    const dayPlans = mealPlans.filter(p => {
      const planDate = new Date(p.date).toLocaleDateString('en-CA', { timeZone: 'UTC' })
      return planDate === targetDate
    })
    const dayLabel = new Date(targetDate + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    if (dayPlans.length === 0) {
      return { message: `Nothing planned for ${dayLabel} yet.` }
    }
    const lines = dayPlans.map(p => {
      const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
      return `${p.mealType}: ${recipeTitles || '(empty)'}`
    })
    return { message: `${dayLabel}:\n${lines.join('\n')}` }
  }

  if (mealPlans.length === 0) {
    return { message: 'No meals planned this week yet.' }
  }
  const lines = mealPlans.map(p => {
    const dateLabel = new Date(p.date).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
    return `${dateLabel} ${p.mealType}: ${recipeTitles || '(empty)'}`
  })
  return { message: lines.join('\n') }
}

// ── generateShoppingList ──────────────────────────────────────────────────────

const generateShoppingDefinition: FunctionDeclaration = {
  name: 'generateShoppingList',
  description: "Add all ingredients from this week's planned recipes to the shopping list. Use this when the user says \"add this week's ingredients to the shopping list\", \"generate a shopping list from the meal plan\", or \"what do I need to buy for this week's meals?\".",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      confirm: { type: SchemaType.BOOLEAN, description: 'Always set to true — the user has explicitly requested this.' },
    },
    required: ['confirm'],
  },
}

async function generateShoppingHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = 'UTC'
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { format, addDays, parseISO } = require('date-fns')
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: new Date(nowStr), lte: new Date(weekEndStr + 'T23:59:59Z') },
    },
    include: {
      recipes: { include: { recipe: { select: { title: true, ingredients: true } } }, orderBy: { order: 'asc' } },
    },
    orderBy: { date: 'asc' },
  })

  // Collect all unique recipe IDs from this week's meal plan
  const recipeIds = new Set<string>()
  for (const plan of mealPlans) {
    for (const r of plan.recipes) {
      if ((r as { recipeId?: string }).recipeId) {
        recipeIds.add((r as { recipeId: string }).recipeId)
      }
    }
  }

  // Also collect from MealPlanRecipe table
  const planRecipeIds = await prisma.mealPlanRecipe.findMany({
    where: { mealPlanId: { in: mealPlans.map(p => p.id) } },
    select: { recipeId: true },
  })
  for (const r of planRecipeIds) recipeIds.add(r.recipeId)

  if (recipeIds.size === 0) {
    return { message: 'No recipes in this week\'s meal plan to generate a list from.' }
  }

  // Load full ingredient lists for those recipes
  const recipeDetails = await prisma.recipe.findMany({
    where: { id: { in: Array.from(recipeIds) }, familyId: ctx.familyId },
    select: { title: true, ingredients: true },
  })

  const allIngredients: string[] = []
  for (const r of recipeDetails) {
    const parsed = safeParseStringArray(r.ingredients)
    allIngredients.push(...parsed)
  }

  if (allIngredients.length === 0) {
    return { message: 'Recipes found but no ingredients to add.' }
  }

  // Get or create the shopping list
  const shoppingLists = await prisma.list.findMany({
    where: { familyId: ctx.familyId, isActive: true, type: 'SHOPPING' },
    select: { id: true, name: true },
    take: 1,
  })

  let list = shoppingLists[0]
  if (!list) {
    const created = await prisma.list.create({
      data: { name: 'Shopping List', type: 'SHOPPING', familyId: ctx.familyId },
    })
    list = { id: created.id, name: created.name }
  }

  const maxOrder = await prisma.listItem.aggregate({
    where: { listId: list.id },
    _max: { sortOrder: true },
  })
  const baseOrder = (maxOrder._max.sortOrder ?? 0) + 1

  await prisma.listItem.createMany({
    data: allIngredients.map((ingredient, i) => ({
      content: ingredient,
      listId: list.id,
      createdBy: ctx.user.id,
      sortOrder: baseOrder + i,
    })),
  })

  const recipeNames = recipeDetails.map(r => r.title).join(', ')
  return {
    message: `Added ${allIngredients.length} ingredients from ${recipeDetails.length} recipe${recipeDetails.length > 1 ? 's' : ''} (${recipeNames}) to ${list.name}.`,
    action: 'generateShoppingList',
  }
}

// ── Register all meal plan tools ──────────────────────────────────────────────

export function registerMealPlanTools(): void {
  registerTool('addRecipeToMealPlan', {
    definition: addRecipeDefinition,
    contextProvider: mealPlanContextProvider,
    handler: addRecipeHandler,
    actionEvents: { addRecipeToMealPlan: 'app:mealPlanUpdated' },
  })

  registerTool('clearMealPlanSlot', {
    definition: clearSlotDefinition,
    handler: clearSlotHandler,
    actionEvents: { clearMealPlanSlot: 'app:mealPlanUpdated' },
  })

  registerTool('queryMealPlan', {
    definition: queryDefinition,
    handler: queryHandler,
  })

  registerTool('generateShoppingList', {
    definition: generateShoppingDefinition,
    handler: generateShoppingHandler,
    actionEvents: { generateShoppingList: 'app:shoppingListUpdated' },
  })
}
