import { describe, it, expect } from 'vitest'
import { parseRecipePage } from '@/lib/recipe-scraper'

const BASIC_JSON_LD_HTML = `
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Classic Pancakes",
  "description": "Fluffy pancakes for breakfast.",
  "recipeIngredient": ["1 cup flour", "1 egg", "1 cup milk"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Mix flour and milk." },
    { "@type": "HowToStep", "text": "Add egg and stir." },
    { "@type": "HowToStep", "text": "Cook on griddle until golden." }
  ]
}
</script>
</head>
<body><h1>Classic Pancakes</h1></body>
</html>
`

const GRAPH_JSON_LD_HTML = `
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "Pancake page" },
    {
      "@type": "Recipe",
      "name": "Waffles",
      "description": "",
      "recipeIngredient": ["2 cups flour", "2 eggs"],
      "recipeInstructions": [
        { "@type": "HowToStep", "text": "Mix ingredients." },
        { "@type": "HowToStep", "text": "Pour into waffle iron." }
      ]
    }
  ]
}
</script>
</head>
</html>
`

const STRING_INSTRUCTIONS_HTML = `
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Simple Toast",
  "description": "Toast bread.",
  "recipeIngredient": ["1 slice bread"],
  "recipeInstructions": "Put bread in toaster. Toast. Eat."
}
</script>
</head>
</html>
`

const NO_RECIPE_HTML = `
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{ "@type": "Article", "name": "Not a recipe" }
</script>
</head>
<body><p>Just an article</p></body>
</html>
`

const NO_JSON_LD_HTML = `
<!DOCTYPE html>
<html>
<body><h1>Just a plain page</h1></body>
</html>
`

describe('parseRecipePage', () => {
  const url = 'https://example.com/recipe'

  it('extracts title, ingredients, and instructions from basic JSON-LD', () => {
    const result = parseRecipePage(BASIC_JSON_LD_HTML, url)
    expect(result.title).toBe('Classic Pancakes')
    expect(result.description).toBe('Fluffy pancakes for breakfast.')
    expect(result.ingredients).toEqual(['1 cup flour', '1 egg', '1 cup milk'])
    expect(result.instructions).toHaveLength(3)
    expect(result.instructions[0]).toBe('Mix flour and milk.')
    expect(result.sourceUrl).toBe(url)
  })

  it('finds Recipe inside @graph array', () => {
    const result = parseRecipePage(GRAPH_JSON_LD_HTML, url)
    expect(result.title).toBe('Waffles')
    expect(result.ingredients).toHaveLength(2)
    expect(result.instructions).toHaveLength(2)
  })

  it('handles string recipeInstructions', () => {
    const result = parseRecipePage(STRING_INSTRUCTIONS_HTML, url)
    expect(result.title).toBe('Simple Toast')
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toBe('Put bread in toaster. Toast. Eat.')
  })

  it('returns empty result when no Recipe JSON-LD is present', () => {
    const result = parseRecipePage(NO_RECIPE_HTML, url)
    expect(result.title).toBe('')
    expect(result.ingredients).toHaveLength(0)
    expect(result.instructions).toHaveLength(0)
    expect(result.sourceUrl).toBe(url)
  })

  it('returns empty result when no JSON-LD at all', () => {
    const result = parseRecipePage(NO_JSON_LD_HTML, url)
    expect(result.title).toBe('')
    expect(result.sourceUrl).toBe(url)
  })
})
