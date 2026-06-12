// Server-only pantry operations (DB writes + external lookups).
// Pure/client-safe logic lives in pantry-helpers.ts.

import { prisma } from '@/lib/prisma'
import { matchPantryItem, normalizePantryName } from '@/lib/pantry-helpers'
import { normalizeIngredient, autoGuessCategory } from '@/lib/ingredient-helpers'
import { ensureGroceriesList } from '@/lib/grocery-list'

// Bulk "we just bought these" — match each name against existing pantry items
// (case-insensitive via normalizePantryName) and flip them to stocked; names
// with no match become new stocked items. Used by the shopping-checkoff flow.
export async function restockPantryItems(
  familyId: string,
  names: string[]
): Promise<{ updated: number; created: number }> {
  const existing = await prisma.pantryItem.findMany({ where: { familyId } })
  const toUpdate: string[] = []
  const toCreate: string[] = []
  const seen = new Set<string>()

  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const match = matchPantryItem(existing, name)
    if (match) {
      if (!seen.has(match.id)) { toUpdate.push(match.id); seen.add(match.id) }
    } else {
      const dupKey = name.toLowerCase()
      if (!seen.has(dupKey)) { toCreate.push(name); seen.add(dupKey) }
    }
  }

  if (toUpdate.length > 0) {
    await prisma.pantryItem.updateMany({
      where: { id: { in: toUpdate }, familyId },
      data: { status: 'stocked' },
    })
  }
  if (toCreate.length > 0) {
    await prisma.pantryItem.createMany({
      data: toCreate.map(name => ({ familyId, name, status: 'stocked' })),
    })
  }

  return { updated: toUpdate.length, created: toCreate.length }
}

// Resolve a scanned barcode to a product name: the family's learned mappings
// first (covers Aldi/Coles home brands absent from public databases), then
// Open Food Facts. Returns null when neither knows the code — the caller
// should then ask the user to name it once and call teachBarcode.
export async function resolveBarcode(
  familyId: string,
  barcode: string
): Promise<{ productName: string; source: 'local' | 'openfoodfacts' } | null> {
  const local = await prisma.barcodeMapping.findUnique({
    where: { familyId_barcode: { familyId, barcode } },
  })
  if (local) return { productName: local.productName, source: 'local' }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,brands`,
      {
        headers: { 'User-Agent': 'HomeBase/1.0 (family household app)' },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      status?: number
      product?: { product_name?: string; brands?: string }
    }
    const name = data.product?.product_name?.trim()
    if (data.status !== 1 || !name) return null
    const brand = data.product?.brands?.split(',')[0]?.trim()
    const productName = brand && !name.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${name}`
      : name
    return { productName, source: 'openfoodfacts' }
  } catch {
    // Network failure / timeout — treat as unresolved, not an error
    return null
  }
}

// Add the given pantry items to the Groceries shopping list, skipping any
// whose name already appears as an uncompleted item there. Categories come
// from the family's learned IngredientCategory mappings, else the built-in
// keyword guess — same resolution order as the meal-plan grocery export.
export async function addPantryItemsToShopping(
  familyId: string,
  userId: string,
  ids: string[]
): Promise<{ added: number; skipped: number }> {
  const pantryItems = await prisma.pantryItem.findMany({
    where: { id: { in: ids }, familyId },
  })
  if (pantryItems.length === 0) return { added: 0, skipped: 0 }

  const list = await ensureGroceriesList(familyId)
  const onList = await prisma.listItem.findMany({
    where: { listId: list.id, isCompleted: false },
    select: { content: true },
  })
  const onListKeys = new Set(onList.map(i => normalizePantryName(i.content)))

  const toAdd = pantryItems.filter(p => !onListKeys.has(normalizePantryName(p.name)))
  if (toAdd.length > 0) {
    const keys = toAdd.map(p => normalizeIngredient(p.name))
    const learned = await prisma.ingredientCategory.findMany({
      where: { familyId, key: { in: keys } },
    })
    const learnedMap = new Map(learned.map(l => [l.key, l.category]))
    await prisma.listItem.createMany({
      data: toAdd.map((p, i) => {
        const key = normalizeIngredient(p.name)
        return {
          content: p.name,
          category: learnedMap.get(key) ?? autoGuessCategory(key),
          sortOrder: i,
          createdBy: userId,
          listId: list.id,
        }
      }),
    })
  }

  return { added: toAdd.length, skipped: pantryItems.length - toAdd.length }
}

export async function teachBarcode(familyId: string, barcode: string, productName: string) {
  return prisma.barcodeMapping.upsert({
    where: { familyId_barcode: { familyId, barcode } },
    update: { productName: productName.trim() },
    create: { familyId, barcode, productName: productName.trim() },
  })
}
