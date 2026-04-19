import { describe, it, expect } from 'vitest'
import {
  parseIso8601Duration,
  parseServings,
  parseUmamiTags,
  parseUmamiRecipe,
} from '@/lib/umami-parser'

describe('parseIso8601Duration', () => {
  it('returns null for zero duration', () => {
    expect(parseIso8601Duration('P0Y0M0DT0H0M0S')).toBeNull()
  })

  it('extracts minutes only', () => {
    expect(parseIso8601Duration('P0Y0M0DT0H10M0S')).toBe(10)
  })

  it('converts hours to minutes and adds', () => {
    expect(parseIso8601Duration('P0Y0M0DT1H30M0S')).toBe(90)
  })

  it('returns null for empty string', () => {
    expect(parseIso8601Duration('')).toBeNull()
  })
})

describe('parseServings', () => {
  it('parses integer string', () => {
    expect(parseServings('4')).toBe(4)
  })

  it('parses "N servings" format', () => {
    expect(parseServings('2 servings')).toBe(2)
  })

  it('returns null for empty string', () => {
    expect(parseServings('')).toBeNull()
  })

  it('returns null for non-numeric', () => {
    expect(parseServings('varies')).toBeNull()
  })
})

describe('parseUmamiTags', () => {
  it('removes recipe name (first keyword) and book name', () => {
    expect(parseUmamiTags('Mushroom Pasta, Vegetarian, RECIPES', 'Mushroom Pasta', 'RECIPES')).toEqual(['Vegetarian'])
  })

  it('returns empty array when only recipe name and book name', () => {
    expect(parseUmamiTags('Chicken Soup, Soups', 'Chicken Soup', 'Soups')).toEqual([])
  })

  it('returns empty array for empty keywords', () => {
    expect(parseUmamiTags('', 'anything', 'book')).toEqual([])
  })

  it('trims whitespace from tags', () => {
    expect(parseUmamiTags('My Recipe,  Italian , Pasta', 'My Recipe', 'Other')).toEqual(['Italian', 'Pasta'])
  })

  it('deduplicates tags', () => {
    expect(parseUmamiTags('Recipe, Keto, Keto', 'Recipe', 'Book')).toEqual(['Keto'])
  })
})

describe('parseUmamiRecipe', () => {
  const umamiJson = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Pumpkin Soup',
    url: 'https://www.umami.recipes/recipe/abc123',
    image: ['https://www.umami.recipes/api/image/abc123?w=2048'],
    description: 'A warming autumn soup',
    prepTime: 'P0Y0M0DT0H15M0S',
    cookTime: 'P0Y0M0DT0H30M0S',
    recipeYield: '4 servings',
    keywords: 'Pumpkin Soup, Soups',
    recipeIngredient: ['1kg pumpkin', '2 cups stock'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Chop pumpkin.' },
      { '@type': 'HowToStep', text: 'Simmer for 20 minutes.' },
    ],
  }

  it('maps title, sourceUrl, image, description', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.title).toBe('Pumpkin Soup')
    expect(result.sourceUrl).toBeNull()
    expect(result.image).toBe('https://www.umami.recipes/api/image/abc123?w=2048')
    expect(result.description).toBe('A warming autumn soup')
  })

  it('preserves external source URL', () => {
    const result = parseUmamiRecipe({ ...umamiJson, url: 'https://www.example.com/recipe/soup' }, 'Soups')
    expect(result.sourceUrl).toBe('https://www.example.com/recipe/soup')
  })

  it('maps prepTime and cookTime to minutes', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.prepTime).toBe(15)
    expect(result.cookTime).toBe(30)
  })

  it('maps servings', () => {
    expect(parseUmamiRecipe(umamiJson, 'Soups').servings).toBe(4)
  })

  it('maps ingredients as array', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.ingredients).toEqual(['1kg pumpkin', '2 cups stock'])
  })

  it('maps instructions as array of step texts', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.instructions).toEqual(['Chop pumpkin.', 'Simmer for 20 minutes.'])
  })

  it('strips recipe name and book name from tags', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.tags).toEqual([])
  })

  it('handles missing image', () => {
    const result = parseUmamiRecipe({ ...umamiJson, image: [] }, 'Soups')
    expect(result.image).toBeNull()
  })

  it('handles missing description', () => {
    const result = parseUmamiRecipe({ ...umamiJson, description: undefined }, 'Soups')
    expect(result.description).toBeNull()
  })
})
