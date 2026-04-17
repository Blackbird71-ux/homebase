import { describe, it, expect } from 'vitest'
import { normalizeIngredient, autoGuessCategory } from '@/lib/ingredient-helpers'

describe('normalizeIngredient', () => {
  it('strips leading number+unit (no space)', () => {
    expect(normalizeIngredient('500g beef mince')).toBe('beef mince')
  })

  it('strips leading number+unit (with space)', () => {
    expect(normalizeIngredient('2 cups chicken stock')).toBe('chicken stock')
  })

  it('strips bare leading number', () => {
    expect(normalizeIngredient('4 chicken thighs')).toBe('chicken thighs')
  })

  it('strips "cloves" as a unit word', () => {
    expect(normalizeIngredient('2 cloves garlic')).toBe('garlic')
  })

  it('leaves text-only ingredient unchanged', () => {
    expect(normalizeIngredient('olive oil')).toBe('olive oil')
  })

  it('lowercases the result', () => {
    expect(normalizeIngredient('Fresh Rosemary')).toBe('fresh rosemary')
  })

  it('trims whitespace', () => {
    expect(normalizeIngredient('  1 onion  ')).toBe('onion')
  })

  it('strips preposition after unit word', () => {
    expect(normalizeIngredient('2 heads of garlic')).toBe('garlic')
  })

  it('handles unicode fraction quantities', () => {
    expect(normalizeIngredient('½ cup sugar')).toBe('sugar')
  })
})

describe('autoGuessCategory', () => {
  it('guesses Meat for chicken', () => {
    expect(autoGuessCategory('chicken thighs')).toBe('Meat')
  })

  it('guesses Meat for beef mince', () => {
    expect(autoGuessCategory('beef mince')).toBe('Meat')
  })

  it('guesses Dairy for parmesan', () => {
    expect(autoGuessCategory('parmesan to serve')).toBe('Dairy')
  })

  it('guesses Dairy for eggs', () => {
    expect(autoGuessCategory('eggs')).toBe('Dairy')
  })

  it('guesses Produce for garlic', () => {
    expect(autoGuessCategory('garlic')).toBe('Produce')
  })

  it('guesses Produce for onion', () => {
    expect(autoGuessCategory('onion')).toBe('Produce')
  })

  it('guesses Bakery for spaghetti', () => {
    expect(autoGuessCategory('spaghetti')).toBe('Bakery')
  })

  it('guesses Household for olive oil', () => {
    expect(autoGuessCategory('olive oil')).toBe('Household')
  })

  it('guesses Frozen for frozen peas', () => {
    expect(autoGuessCategory('frozen peas')).toBe('Frozen')
  })

  it('falls back to Other for unknown ingredient', () => {
    expect(autoGuessCategory('xanthan gum')).toBe('Other')
  })
})
