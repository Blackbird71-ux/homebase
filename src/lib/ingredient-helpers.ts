import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'

export const KEYWORD_MAP: Record<ShoppingCategory, string[]> = {
  Meat:      ['chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'mince', 'bacon', 'turkey', 'duck', 'steak', 'sausage', 'ham', 'chorizo'],
  Dairy:     ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'egg', 'ricotta', 'brie', 'feta'],
  Produce:   ['onion', 'garlic', 'tomato', 'lettuce', 'carrot', 'celery', 'lemon', 'lime', 'herb', 'rosemary', 'basil', 'thyme', 'parsley', 'spinach', 'capsicum', 'mushroom', 'potato', 'zucchini', 'broccoli', 'cucumber', 'avocado', 'ginger', 'apple', 'banana', 'orange'],
  Bakery:    ['bread', 'flour', 'pasta', 'spaghetti', 'crouton', 'noodle', 'rice', 'couscous', 'pita', 'tortilla', 'bun', 'roll', 'pastry'],
  Frozen:    ['frozen'],
  Household: ['oil', 'vinegar', 'sauce', 'stock', 'dressing', 'salt', 'pepper', 'sugar', 'honey', 'soy', 'mustard', 'ketchup', 'mayo', 'mayonnaise'],
  Other:     [],
}

// Strips leading quantity + unit or bare number, then lowercases.
// "500g beef mince" → "beef mince"
// "2 cloves garlic" → "garlic"
// "4 chicken thighs" → "chicken thighs"
// "olive oil" → "olive oil"
// "2 heads of garlic" → "garlic"
// "½ cup sugar" → "sugar"
const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '¼': '1/4', '¾': '3/4', '⅔': '2/3', '⅛': '1/8',
}
const UNIT_RE = /^\d+[\d./]*\s*(g|kg|ml|l|oz|lb|cups?|tbsps?|tsps?|teaspoons?|tablespoons?|bunches?|cloves?|heads?|cans?|tins?|packets?|large|small|medium|x)\s+/i
const BARE_NUMBER_RE = /^\d+\s+/
const PREPOSITION_RE = /^(of|the|a|an)\s+/i

export function normalizeIngredient(text: string): string {
  const trimmed = text.trim().replace(/[½⅓¼¾⅔⅛]/g, (c) => UNICODE_FRACTIONS[c] ?? c)
  const afterUnit = trimmed.replace(UNIT_RE, '')
  const afterBare = afterUnit === trimmed ? trimmed.replace(BARE_NUMBER_RE, '') : afterUnit
  return afterBare.replace(PREPOSITION_RE, '').toLowerCase().trim()
}

export function autoGuessCategory(key: string): ShoppingCategory {
  const lower = key.toLowerCase()
  for (const cat of SHOPPING_CATEGORIES) {
    if (cat === 'Other') continue
    if (KEYWORD_MAP[cat].some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}
