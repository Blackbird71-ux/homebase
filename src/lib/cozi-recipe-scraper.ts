/**
 * cozi-recipe-scraper.ts
 *
 * Extracts recipe data from Cozi web app recipe pages.
 *
 * Cozi's free tier doesn't provide a recipe export, but recipes are rendered
 * on the web app at recipes.cozi.com or cozi.com/my-family/recipes/{id}.
 * This parser tries multiple extraction strategies:
 *
 *   1. JSON-LD — standard structured data (used by many recipe hosting sites)
 *   2. DOM heuristics — look for common Cozi recipe page patterns by selector
 *   3. Direct JSON — accept pre-extracted data from the bookmarklet
 *
 * USAGE (server-side scrape):
 *   const recipe = parseCoziRecipeHtml(html, url)
 *
 * USAGE (bookmarklet output):
 *   const recipe = parseCoziRecipeJson(jsonString)
 */

import { load } from 'cheerio'

// ── Public types ─────────────────────────────────────────────────────────────

export interface CoziRecipeData {
  title: string
  description: string
  ingredients: string[]
  instructions: string[]
  prepTime: number | null     // minutes
  cookTime: number | null
  servings: number | null
  sourceUrl: string | null    // original recipe URL if Cozi imported it
  image: string | null
  tags: string[]
}

// ── Alternative selectors that Cozi MAY use (based on common patterns) ──────

const TITLE_SELECTORS = [
  'h1.recipe-title',
  'h1.recipe-name',
  'h1[class*="recipe" i]',
  'h1',
  '[class*="recipe-title" i] h1',
  '[class*="recipe-name" i] h1',
  '.recipe-detail h1',
  'h2.recipe-title',
  'h2[class*="recipe" i]',
]

const INGREDIENT_SELECTORS = [
  'ul.ingredients',
  'ul[class*="ingredient" i]',
  '[class*="ingredients" i] ul',
  '[class*="ingredient" i] ul',
  '.recipe-ingredients ul',
  '.ingredient-list',
  'div[class*="ingredient" i]',
  // Catch-all: any list inside a section that mentions ingredients
  'section[class*="ingredient" i] ul',
  'section[class*="ingredient" i] li',
]

const INSTRUCTION_SELECTORS = [
  'ol.instructions',
  'ol.directions',
  'ol.steps',
  'ol[class*="instruction" i]',
  'ol[class*="direction" i]',
  'ol[class*="step" i]',
  '[class*="instructions" i] ol',
  '[class*="directions" i] ol',
  '[class*="steps" i] ol',
  '.recipe-directions ol',
  '.recipe-instructions ol',
  // Catch-all: list items inside a section that mentions directions/instructions
  'section[class*="instruction" i] li',
  'section[class*="direction" i] li',
  'section[class*="step" i] li',
  'ul.instructions li',
  'ul[class*="direction" i] li',
  'div[class*="directions" i] li',
  'div[class*="instructions" i] li',
  'div[class*="steps" i] li',
  'div[class*="step" i] li',
]

const SERVINGS_SELECTORS = [
  '[class*="serving" i]',
  '[class*="yield" i]',
  '.recipe-servings',
  '.recipe-yield',
]

const TIME_SELECTORS = [
  '[class*="prep-time" i]',
  '[class*="preptime" i]',
  '[class*="cook-time" i]',
  '[class*="cooktime" i]',
  '[class*="total-time" i]',
  '[class*="totaltime" i]',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryExtractJsonLd($: ReturnType<typeof load>): CoziRecipeData | null {
  const scripts = $('script[type="application/ld+json"]')
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).html()
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      const candidates = Array.isArray(data)
        ? data
        : data['@graph']
          ? data['@graph']
          : [data]
      for (const candidate of candidates) {
        const type = candidate['@type']
        if (!type) continue
        const types = Array.isArray(type) ? type : [type]
        if (!types.some((t: string) => t.includes('Recipe'))) continue

        const ingredients: string[] = Array.isArray(candidate['recipeIngredient'])
          ? candidate['recipeIngredient'].map(String).filter(Boolean)
          : []

        const instructions: string[] = extractInstructionsFromJsonLd(candidate)

        return {
          title: String(candidate['name'] ?? ''),
          description: String(candidate['description'] ?? ''),
          ingredients,
          instructions,
          prepTime: parseTime(candidate['prepTime']),
          cookTime: parseTime(candidate['cookTime']),
          servings: parseInt(String(candidate['recipeYield'] ?? ''), 10) || null,
          sourceUrl: String(candidate['url'] ?? ''),
          image: extractImageUrl(candidate),
          tags: [],
        }
      }
    } catch {
      continue
    }
  }
  return null
}

function extractInstructionsFromJsonLd(data: Record<string, unknown>): string[] {
  const raw = data['recipeInstructions']
  const result: string[] = []
  if (!Array.isArray(raw)) return result

  for (const item of raw) {
    if (typeof item === 'string') {
      result.push(item)
    } else if (item && typeof item === 'object' && 'text' in item) {
      result.push(String((item as Record<string, unknown>).text))
    } else if (item && typeof item === 'object' && 'name' in item) {
      // HowToSection
      const section = item as Record<string, unknown>
      if (section['itemListElement'] && Array.isArray(section['itemListElement'])) {
        for (const step of section['itemListElement']) {
          if (step && typeof step === 'object' && 'text' in step) {
            result.push(String((step as Record<string, unknown>).text))
          }
        }
      }
    }
  }
  return result
}

function extractImageUrl(data: Record<string, unknown>): string | null {
  const img = data['image']
  if (!img) return null
  if (typeof img === 'string') return img
  if (Array.isArray(img) && img.length > 0) {
    if (typeof img[0] === 'string') return img[0]
    if (img[0] && typeof img[0] === 'object' && 'url' in (img[0] as Record<string, unknown>)) {
      return String((img[0] as Record<string, unknown>).url)
    }
  }
  return null
}

function parseTime(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  const str = String(value)
  // ISO 8601 duration: PT15M, PT1H30M
  const match = str.match(/PT?(?:(\d+)H)?(?:(\d+)M)?/)
  if (match) {
    const hours = parseInt(match[1] || '0', 10)
    const mins = parseInt(match[2] || '0', 10)
    return hours * 60 + mins
  }
  const num = parseInt(str, 10)
  return isNaN(num) ? null : num
}

function cleanListItem(text: string): string {
  return text
    .replace(/^\s*[\d.]+[.)]?\s*/, '') // remove numbering
    .replace(/□|▪|•|‣|⁃|-/g, '')        // remove bullet chars
    .trim()
}

function extractTextList(
  $: ReturnType<typeof load>,
  selectors: string[]
): string[] {
  for (const sel of selectors) {
    const el = $(sel)
    if (el.length === 0) continue

    // If selector targets <li> elements directly
    if (sel.endsWith('li')) {
      const items: string[] = []
      el.each((_, node) => {
        const text = cleanListItem($(node).text())
        if (text) items.push(text)
      })
      if (items.length > 0) return items
    }

    // If selector targets a container, find all <li> inside
    const listItems = el.find('li')
    if (listItems.length > 0) {
      const items: string[] = []
      listItems.each((_, node) => {
        const text = cleanListItem($(node).text())
        if (text) items.push(text)
      })
      if (items.length > 0) return items
    }

    // Fallback: split by newline / <br>
    const html = el.html()
    if (html) {
      const items = $(html)
        .text()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (items.length > 0) return items
    }
  }
  return []
}

function extractFirstText(
  $: ReturnType<typeof load>,
  selectors: string[]
): string | null {
  for (const sel of selectors) {
    const el = $(sel).first()
    if (el.length === 0) continue
    const text = el.text().trim()
    if (text) return text
  }
  return null
}

function extractNumberFromText(
  $: ReturnType<typeof load>,
  selectors: string[]
): number | null {
  const text = extractFirstText($, selectors)
  if (!text) return null
  const match = text.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function extractTimeFromText(
  $: ReturnType<typeof load>,
  selectors: string[]
): number | null {
  const text = extractFirstText($, selectors)
  if (!text) return null
  let total = 0
  const hMatch = text.match(/(\d+)\s*(?:hr|hour|h)/i)
  const mMatch = text.match(/(\d+)\s*(?:min|minute|m)(?!\s*(?:hr|hour|h))/i)
  if (hMatch) total += parseInt(hMatch[1], 10) * 60
  if (mMatch) total += parseInt(mMatch[1], 10)
  return total > 0 ? total : null
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse recipe data from raw HTML (e.g. a Cozi recipe page).
 * Tries JSON-LD first, then falls back to DOM heuristics.
 */
export function parseCoziRecipeHtml(html: string, pageUrl?: string): CoziRecipeData {
  const $ = load(html)

  // Strategy 1: JSON-LD
  const jsonLd = tryExtractJsonLd($)
  if (jsonLd && jsonLd.title && jsonLd.ingredients.length > 0) {
    return {
      ...jsonLd,
      sourceUrl: jsonLd.sourceUrl || pageUrl || null,
    }
  }

  // Strategy 2: DOM heuristics
  const title = extractFirstText($, TITLE_SELECTORS) ?? ''

  const ingredients = extractTextList($, INGREDIENT_SELECTORS)

  const instructions = extractTextList($, INSTRUCTION_SELECTORS)

  const servings = extractNumberFromText($, SERVINGS_SELECTORS)

  // Try to parse prep and cook time from combined selectors
  const prepTime = extractTimeFromText($, TIME_SELECTORS.filter((s) => /prep/i.test(s)))
  const cookTime = extractTimeFromText($, TIME_SELECTORS.filter((s) => /cook/i.test(s)))

  return {
    title,
    description: '',
    ingredients,
    instructions,
    prepTime,
    cookTime,
    servings,
    sourceUrl: pageUrl || null,
    image: null,
    tags: [],
  }
}

/**
 * Parse recipe data from a JSON object (as produced by the bookmarklet).
 * Validates required fields and returns a clean CoziRecipeData.
 */
export function parseCoziRecipeJson(json: Record<string, unknown>): CoziRecipeData {
  const ingredients = Array.isArray(json['ingredients'])
    ? (json['ingredients'] as string[]).map(String).filter(Boolean)
    : typeof json['ingredients'] === 'string'
      ? (json['ingredients'] as string).split('\n').map((s) => s.trim()).filter(Boolean)
      : []

  const instructions = Array.isArray(json['instructions'])
    ? (json['instructions'] as string[]).map(String).filter(Boolean)
    : typeof json['instructions'] === 'string'
      ? (json['instructions'] as string).split('\n').map((s) => s.trim()).filter(Boolean)
      : []

  return {
    title: String(json['title'] ?? ''),
    description: String(json['description'] ?? ''),
    ingredients,
    instructions,
    prepTime: typeof json['prepTime'] === 'number' ? json['prepTime'] : null,
    cookTime: typeof json['cookTime'] === 'number' ? json['cookTime'] : null,
    servings: typeof json['servings'] === 'number' ? json['servings'] : null,
    sourceUrl: json['sourceUrl'] ? String(json['sourceUrl']) : null,
    image: json['image'] ? String(json['image']) : null,
    tags: Array.isArray(json['tags']) ? (json['tags'] as string[]).map(String).filter(Boolean) : [],
  }
}

/**
 * Validate that a parsed recipe has the minimum required data.
 */
export function isValidRecipe(data: CoziRecipeData): boolean {
  return (
    data.title.trim().length > 0 &&
    data.ingredients.length > 0 &&
    data.instructions.length > 0
  )
}

/**
 * Format a recipe for display / debugging.
 */
export function formatRecipeSummary(data: CoziRecipeData): string {
  const parts = [data.title]
  if (data.servings) parts.push(`Serves ${data.servings}`)
  if (data.prepTime) parts.push(`Prep: ${data.prepTime}m`)
  if (data.cookTime) parts.push(`Cook: ${data.cookTime}m`)
  parts.push(`${data.ingredients.length} ingredients`)
  parts.push(`${data.instructions.length} steps`)
  return parts.join(' · ')
}
