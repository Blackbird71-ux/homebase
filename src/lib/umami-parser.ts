export interface UmamiJson {
  name: string
  url?: string
  image?: string[]
  description?: string
  prepTime?: string
  cookTime?: string
  recipeYield?: string
  keywords?: string
  recipeIngredient?: string[]
  recipeInstructions?: { '@type': string; text: string }[]
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

export function parseUmamiTags(keywords: string, recipeName: string, bookName: string): string[] {
  if (!keywords) return []
  const seen = new Set<string>()
  const result: string[] = []
  const lowerRecipe = recipeName.toLowerCase()
  const lowerBook = bookName.toLowerCase()
  for (const raw of keywords.split(',')) {
    const tag = raw.trim()
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
  return {
    title: json.name,
    sourceUrl,
    image: json.image?.[0] ?? null,
    description: json.description ?? null,
    ingredients: json.recipeIngredient ?? [],
    instructions: (json.recipeInstructions ?? []).map((s) => s.text),
    prepTime: parseIso8601Duration(json.prepTime ?? ''),
    cookTime: parseIso8601Duration(json.cookTime ?? ''),
    servings: parseServings(json.recipeYield ?? ''),
    tags: parseUmamiTags(json.keywords ?? '', json.name, bookName),
  }
}
