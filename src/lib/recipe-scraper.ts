import { load } from 'cheerio'

export interface ScrapedRecipe {
  title: string
  description: string
  ingredients: string[]
  instructions: string[]
  sourceUrl: string
  image: string | null
}

function emptyResult(url: string): ScrapedRecipe {
  return { title: '', description: '', ingredients: [], instructions: [], sourceUrl: url, image: null }
}

function extractImageFromJsonLd(data: Record<string, unknown>): string | null {
  const img = data['image']
  if (!img) return null
  if (typeof img === 'string') return img
  if (Array.isArray(img)) {
    if (typeof img[0] === 'string') return img[0]
    if (img[0] && typeof img[0] === 'object' && 'url' in (img[0] as Record<string, unknown>)) {
      return String((img[0] as Record<string, unknown>).url)
    }
  }
  if (typeof img === 'object' && 'url' in (img as Record<string, unknown>)) {
    return String((img as Record<string, unknown>).url)
  }
  return null
}

/** Extract recipe data from raw HTML. Tries JSON-LD first, then gives up gracefully. */
export function parseRecipePage(html: string, url: string): ScrapedRecipe {
  const $ = load(html)

  // Try JSON-LD
  const scriptTags = $('script[type="application/ld+json"]')
  for (let i = 0; i < scriptTags.length; i++) {
    const raw = $(scriptTags[i]).html()
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      // Could be wrapped in @graph array
      const candidates = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data]
      for (const candidate of candidates) {
        if (candidate['@type'] === 'Recipe' || candidate['@type']?.includes?.('Recipe')) {
          return extractFromJsonLd(candidate, url)
        }
      }
    } catch {
      // Invalid JSON — try next script tag
    }
  }

  return emptyResult(url)
}

function extractFromJsonLd(data: Record<string, unknown>, url: string): ScrapedRecipe {
  const title = String(data['name'] ?? '')
  const description = String(data['description'] ?? '')

  // recipeIngredient is an array of strings
  const rawIngredients = data['recipeIngredient']
  const ingredients: string[] = Array.isArray(rawIngredients)
    ? rawIngredients.map(String).filter(Boolean)
    : []

  // recipeInstructions can be string[], HowToStep[], or HowToSection[]
  const rawInstructions = data['recipeInstructions']
  const instructions: string[] = []
  if (Array.isArray(rawInstructions)) {
    for (const step of rawInstructions) {
      if (typeof step === 'string') {
        instructions.push(step)
      } else if (typeof step === 'object' && step !== null) {
        const s = step as Record<string, unknown>
        if (s['@type'] === 'HowToStep') {
          const text = String(s['text'] ?? s['name'] ?? '')
          if (text) instructions.push(text)
        } else if (s['@type'] === 'HowToSection') {
          const subSteps = s['itemListElement']
          if (Array.isArray(subSteps)) {
            for (const sub of subSteps) {
              const t = String(
                typeof sub === 'string' ? sub : (sub as Record<string, unknown>)['text'] ?? ''
              )
              if (t) instructions.push(t)
            }
          }
        }
      }
    }
  } else if (typeof rawInstructions === 'string') {
    instructions.push(rawInstructions)
  }

  return {
    title,
    description,
    ingredients,
    instructions,
    sourceUrl: url,
    image: extractImageFromJsonLd(data),
  }
}
