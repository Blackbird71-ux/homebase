export interface UmamiJson {
  name: string
  url?: string
  image?: string[]
  description?: string
  prepTime?: string
  cookTime?: string
  recipeYield?: string
  keywords?: string
  recipeCategory?: string
  recipeIngredient?: string[]
  recipeInstructions?: { '@type': string; text: string }[]
  nutrition?: {
    calories?: string
    fatContent?: string
    proteinContent?: string
    carbohydrateContent?: string
    sodiumContent?: string
  }
}

export interface ParsedRecipe {
  title: string
  sourceUrl: string | null
  image: string | null
  description: string | null
  ingredients: string[]
  instructions: string[]
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  tags: string[]
  calories: string | null
  fatContent: string | null
  proteinContent: string | null
  carbContent: string | null
  sodiumContent: string | null
}

export function parseIso8601Duration(s: string): number | null {
  if (!s) return null
  // Match time part only (after T)
  const timeMatch = s.match(/T(.*)/)?.[1] ?? ''
  const hours = timeMatch.match(/(\d+)H/)?.[1] ?? '0'
  const minutes = timeMatch.match(/(\d+)M/)?.[1] ?? '0'
  const total = parseInt(hours) * 60 + parseInt(minutes)
  return total > 0 ? total : null
}

export function parseServings(s: string): number | null {
  if (!s) return null
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null
  
  // Simple cleanup for common issues in Umami imports
  let cleaned = text
  
  // Fix " with or without spaces
  cleaned = cleaned.replace(/&quot\s*;/g, '"')
  // Fix & with or without spaces
  cleaned = cleaned.replace(/&amp\s*;/g, '&')
  // Fix < with or without spaces
  cleaned = cleaned.replace(/&lt\s*;/g, '<')
  // Fix > with or without spaces
  cleaned = cleaned.replace(/&gt\s*;/g, '>')
  // Fix &nbsp; with or without spaces
  cleaned = cleaned.replace(/&nbsp\s*;/g, ' ')
  // Fix &#39; with or without spaces
  cleaned = cleaned.replace(/&#39\s*;/g, "'")
  // Fix ' with or without spaces
  cleaned = cleaned.replace(/&apos\s*;/g, "'")
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  return cleaned
}

export function parseUmamiTags(keywords: string, recipeCategory: string | undefined, recipeName: string, bookName: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const lowerRecipe = recipeName.toLowerCase()
  const lowerBook = bookName.toLowerCase()

  const allKeywords = [
    ...(keywords ? keywords.split(',') : []),
    ...(recipeCategory ? [recipeCategory] : []),
  ]

  for (const raw of allKeywords) {
    const tag = cleanText(raw)?.trim()
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (lower === lowerRecipe || lower === lowerBook) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(tag)
  }
  return result
}

export function parseUmamiRecipe(json: UmamiJson, bookName: string): ParsedRecipe {
  const rawUrl = json.url ?? null
  const sourceUrl = rawUrl && !rawUrl.includes('umami.recipes') ? rawUrl : null
  
  // Clean text fields to remove HTML entities and garbage
  const title = cleanText(json.name) || json.name
  const description = cleanText(json.description) || json.description || null
  
  // Clean ingredients
  const ingredients = (json.recipeIngredient ?? []).map(ing => cleanText(ing) || ing)
  
  // Clean instructions
  const instructions = (json.recipeInstructions ?? []).map(s => cleanText(s.text) || s.text)
  
  return {
    title,
    sourceUrl,
    image: json.image?.[0] ?? null,
    description,
    ingredients,
    instructions,
    prepTime: parseIso8601Duration(json.prepTime ?? ''),
    cookTime: parseIso8601Duration(json.cookTime ?? ''),
    servings: parseServings(json.recipeYield ?? ''),
    tags: parseUmamiTags(json.keywords ?? '', json.recipeCategory, json.name, bookName),
    calories: json.nutrition?.calories ?? null,
    fatContent: json.nutrition?.fatContent ?? null,
    proteinContent: json.nutrition?.proteinContent ?? null,
    carbContent: json.nutrition?.carbohydrateContent ?? null,
    sodiumContent: json.nutrition?.sodiumContent ?? null,
  }
}
