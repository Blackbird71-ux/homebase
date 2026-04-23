import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'

export const KEYWORD_MAP: Record<ShoppingCategory, string[]> = {
  Meat:      ['chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'mince', 'bacon', 'turkey', 'duck', 'steak', 'sausage', 'ham', 'chorizo', 'meat', 'poultry', 'seafood', 'rib', 'wing', 'thigh', 'breast', 'fillet', 'cutlet', 'roast', 'ground'],
  Dairy:     ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'egg', 'ricotta', 'brie', 'feta', 'gouda', 'swiss', 'provolone', 'yoghourt', 'custard', 'ice cream', 'sour cream', 'whipping cream', 'heavy cream', 'half and half', 'buttermilk', 'evaporated milk', 'condensed milk'],
  Produce:   ['onion', 'garlic', 'tomato', 'lettuce', 'carrot', 'celery', 'lemon', 'lime', 'herb', 'rosemary', 'basil', 'thyme', 'parsley', 'spinach', 'capsicum', 'mushroom', 'potato', 'zucchini', 'broccoli', 'cucumber', 'avocado', 'ginger', 'apple', 'banana', 'orange', 'pepper', 'bell pepper', 'chili', 'chilli', 'peas', 'corn', 'bean', 'beans', 'pea', 'corn', 'asparagus', 'eggplant', 'aubergine', 'squash', 'pumpkin', 'sweet potato', 'yam', 'turnip', 'radish', 'beet', 'beetroot', 'cabbage', 'kale', 'collard', 'bok choy', 'brussels sprout', 'cauliflower', 'artichoke', 'okra', 'rhubarb', 'fennel', 'leek', 'shallot', 'scallion', 'green onion', 'spring onion', 'chive', 'cilantro', 'coriander', 'dill', 'mint', 'oregano', 'sage', 'tarragon', 'marjoram', 'chives', 'peach', 'pear', 'plum', 'grape', 'berry', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'melon', 'watermelon', 'cantaloupe', 'honeydew', 'pineapple', 'mango', 'papaya', 'kiwi', 'kiwifruit', 'coconut', 'date', 'fig', 'prune', 'raisin', 'currant', 'cranberry'],
  Bakery:    ['bread', 'flour', 'pasta', 'spaghetti', 'crouton', 'noodle', 'rice', 'couscous', 'pita', 'tortilla', 'bun', 'roll', 'pastry', 'cake', 'cookie', 'biscuit', 'cracker', 'muffin', 'scone', 'bagel', 'croissant', 'doughnut', 'donut', 'pie', 'tart', 'brownie', 'cupcake', 'pancake', 'waffle', 'crepe', 'french toast', 'baguette', 'ciabatta', 'focaccia', 'naan', 'matzo', 'matzah', 'cereal', 'oat', 'oats', 'granola', 'muesli', 'quinoa', 'barley', 'bulgur', 'farro', 'millet', 'polenta', 'grits', 'cornmeal', 'corn flour', 'breadcrumb', 'bread crumb', 'breading', 'batter', 'dough', 'yeast', 'baking powder', 'baking soda', 'bicarb', 'bicarbonate'],
  Frozen:    ['frozen', 'ice', 'icy'],
  Household: ['oil', 'vinegar', 'sauce', 'stock', 'dressing', 'salt', 'pepper', 'sugar', 'honey', 'soy', 'mustard', 'ketchup', 'mayo', 'mayonnaise', 'spice', 'herb', 'seasoning', 'flavoring', 'flavouring', 'extract', 'essence', 'vanilla', 'cinnamon', 'nutmeg', 'clove', 'allspice', 'cardamom', 'ginger', 'turmeric', 'cumin', 'coriander', 'paprika', 'chili powder', 'chilli powder', 'cayenne', 'red pepper', 'black pepper', 'white pepper', 'garlic powder', 'onion powder', 'oregano', 'basil', 'thyme', 'rosemary', 'parsley', 'dill', 'mint', 'sage', 'tarragon', 'marjoram', 'bay leaf', 'bay leaves', 'bouquet garni', 'herbes de provence', 'italian seasoning', 'taco seasoning', 'curry powder', 'garam masala', 'five spice', 'seven spice', 'zaatar', 'sumac', 'harissa', 'sriracha', 'hot sauce', 'tabasco', 'worcestershire', 'fish sauce', 'oyster sauce', 'hoisin', 'teriyaki', 'ponzu', 'mirin', 'sake', 'rice vinegar', 'balsamic', 'red wine vinegar', 'white wine vinegar', 'apple cider vinegar', 'distilled vinegar', 'malt vinegar', 'sherry vinegar', 'champagne vinegar', 'olive oil', 'vegetable oil', 'canola oil', 'sunflower oil', 'corn oil', 'peanut oil', 'sesame oil', 'coconut oil', 'avocado oil', 'grapeseed oil', 'soybean oil', 'palm oil', 'shortening', 'lard', 'suet', 'margarine', 'spread', 'spray', 'cooking spray', 'nonstick spray', 'baking spray', 'parchment', 'wax paper', 'aluminum foil', 'aluminium foil', 'plastic wrap', 'cling film', 'ziploc', 'freezer bag', 'sandwich bag', 'trash bag', 'garbage bag', 'paper towel', 'kitchen towel', 'dish soap', 'dishwashing liquid', 'detergent', 'cleaner', 'sponge', 'scrubber', 'brush', 'cloth', 'rag', 'towel', 'napkin', 'tissue', 'toilet paper', 'paper', 'foil', 'wrap', 'bag'],
  Other:     [],
}

export interface CategoryGuess {
  category: string
  confidence: number
  matchedKeyword?: string
}

export interface CategoryWithKeywords {
  id: string
  name: string
  keywords: string[]
  isCustom: boolean
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
  // Normalize the ingredient first to remove quantities and units
  const normalized = normalizeIngredient(key)
  const lower = normalized.toLowerCase()
  
  // Fall back to keyword detection
  for (const cat of SHOPPING_CATEGORIES) {
    if (cat === 'Other') continue
    const keywords = KEYWORD_MAP[cat as keyof typeof KEYWORD_MAP]
    if (keywords && keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}

export function guessCategoryWithKeywords(
  ingredientText: string,
  categories: CategoryWithKeywords[]
): CategoryGuess | null {
  const normalized = normalizeIngredient(ingredientText)
  const lower = normalized.toLowerCase()
  
  let bestMatch: CategoryGuess | null = null
  
  for (const category of categories) {
    for (const keyword of category.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        // Calculate confidence based on keyword length match
        const confidence = keyword.length / Math.max(keyword.length, normalized.length)
        
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            category: category.name,
            confidence,
            matchedKeyword: keyword
          }
        }
      }
    }
  }
  
  return bestMatch
}

export function getDefaultCategories(): CategoryWithKeywords[] {
  return SHOPPING_CATEGORIES.map((cat, index) => ({
    id: `default-${cat.toLowerCase()}`,
    name: cat,
    keywords: KEYWORD_MAP[cat as ShoppingCategory] || [],
    isCustom: false,
    sortOrder: index
  }))
}

export function autoGuessCategoryWithFallback(
  ingredientText: string,
  categories?: CategoryWithKeywords[]
): string {
  if (categories && categories.length > 0) {
    const guess = guessCategoryWithKeywords(ingredientText, categories)
    if (guess) {
      return guess.category
    }
  }
  
  // Fallback to hardcoded categories (synchronous version without DB check)
  const normalized = normalizeIngredient(ingredientText)
  const lower = normalized.toLowerCase()
  
  for (const cat of SHOPPING_CATEGORIES) {
    if (cat === 'Other') continue
    const keywords = KEYWORD_MAP[cat as keyof typeof KEYWORD_MAP]
    if (keywords && keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}
