// src/lib/ai/tools/recipes.tool.ts
// AI tool registrations for recipe operations.
// Provides: searchRecipes, getRecipeIngredients

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { safeParseStringArray } from '@/lib/ai/orchestrator'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function recipesContextProvider(familyId: string, _userId: string): Promise<string> {
  const recipes = await prisma.recipe.findMany({
    where: { familyId },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  })

  if (recipes.length === 0) {
    return 'Available recipes: (none yet)'
  }

  const lines = recipes.map(r => `"${r.title}" (id: ${r.id})`)
  return `Available recipes in the family's recipe collection:\n${lines.join('\n')}`
}

// ── searchRecipes ─────────────────────────────────────────────────────────────

const searchRecipesDefinition: FunctionDeclaration = {
  name: 'searchRecipes',
  description: 'Search the recipe collection by name or keywords. Use this when the user asks "do we have a recipe for X?", "find recipes with chicken", or "what pasta recipes do we have?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'The search term or recipe name to look for' },
    },
    required: ['query'],
  },
}

async function searchRecipesHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { query } = args as { query: string }
  const lower = query.toLowerCase()

  const recipes = await prisma.recipe.findMany({
    where: { familyId: ctx.familyId },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  })

  const matches = recipes.filter(r => r.title.toLowerCase().includes(lower))
  if (matches.length === 0) {
    return { message: `No recipes found matching "${query}".` }
  }

  const lines = matches.map(r => `• ${r.title}`).join('\n')
  return { message: `Found ${matches.length} recipe${matches.length > 1 ? 's' : ''} matching "${query}":\n${lines}` }
}

// ── getRecipeIngredients ──────────────────────────────────────────────────────

const getIngredientsDefinition: FunctionDeclaration = {
  name: 'getRecipeIngredients',
  description: 'Get the ingredient list for a specific recipe. Use this when the user asks "what do I need for X?", "what are the ingredients in X?", or "how do I make X?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      recipeId: { type: SchemaType.STRING, description: 'The ID of the recipe (from the recipes list in context)' },
    },
    required: ['recipeId'],
  },
}

async function getIngredientsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { recipeId } = args as { recipeId: string }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, familyId: ctx.familyId },
    select: { title: true, ingredients: true, servings: true },
  })
  if (!recipe) {
    return { message: 'Recipe not found.' }
  }

  const ingredients = safeParseStringArray(recipe.ingredients)
  if (ingredients.length === 0) {
    return { message: `${recipe.title} has no ingredients listed.` }
  }

  const servingsPart = recipe.servings ? ` (serves ${recipe.servings})` : ''
  const lines = ingredients.map(i => `• ${i}`).join('\n')
  return { message: `${recipe.title}${servingsPart}:\n${lines}` }
}

// ── Register all recipe tools ─────────────────────────────────────────────────

export function registerRecipeTools(): void {
  registerTool('searchRecipes', {
    definition: searchRecipesDefinition,
    contextProvider: recipesContextProvider,
    handler: searchRecipesHandler,
  })

  registerTool('getRecipeIngredients', {
    definition: getIngredientsDefinition,
    handler: getIngredientsHandler,
  })
}
