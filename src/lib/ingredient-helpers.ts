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
const UNIT_RE = /^\d+[\d./]*\s*(g|kg|ml|l|oz|lb|cups?|tbsps?|tsps?|teaspoons?|tablespoons?|bunches?|cloves?|heads?|cans?|tins?|packets?|large|small|medium|x)\s+/i
const BARE_NUMBER_RE = /^\d+\s+/

export function normalizeIngredient(text: string): string {
  const trimmed = text.trim()
  const afterUnit = trimmed.replace(UNIT_RE, '')
  const key = afterUnit === trimmed ? trimmed.replace(BARE_NUMBER_RE, '') : afterUnit
  return key.toLowerCase().trim()
}

export function autoGuessCategory(key: string): ShoppingCategory {
  const lower = key.toLowerCase()
  for (const cat of SHOPPING_CATEGORIES) {
    if (cat === 'Other') continue
    if (KEYWORD_MAP[cat].some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}
