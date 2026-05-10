// src/lib/ai/tools/shopping.tool.ts
// AI tool registrations for shopping list operations.
// Provides: addShoppingListItem, queryShoppingList, completeListItem

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function shoppingContextProvider(familyId: string, _userId: string): Promise<string> {
  const lists = await prisma.list.findMany({
    where: { familyId, isActive: true, type: 'SHOPPING' },
    select: { id: true, name: true },
    take: 5,
  })
  const summary = lists.length > 0
    ? lists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'
  return `Active shopping lists: ${summary}`
}

// ── addShoppingListItem ───────────────────────────────────────────────────────

const addItemDefinition: FunctionDeclaration = {
  name: 'addShoppingListItem',
  description: 'Add one or more items to the active shopping list. Use this when the user says "add X to the shopping list" or "I need milk and eggs".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      items: {
        type: SchemaType.ARRAY,
        description: 'List of items to add',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: 'Item name' },
            quantity: { type: SchemaType.STRING, description: 'Optional quantity or amount, e.g. "2 litres" or "a dozen"' },
          },
          required: ['name'],
        },
      },
    },
    required: ['items'],
  },
}

async function addItemHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { items } = args as { items: Array<{ name: string; quantity?: string }> }

  const lists = await prisma.list.findMany({
    where: { familyId: ctx.familyId, isActive: true, type: 'SHOPPING' },
    select: { id: true, name: true },
    take: 1,
  })

  let list = lists[0]
  if (!list) {
    const created = await prisma.list.create({
      data: { name: 'Shopping List', type: 'SHOPPING', familyId: ctx.familyId },
    })
    list = { id: created.id, name: created.name }
  }

  const maxOrder = await prisma.listItem.aggregate({
    where: { listId: list.id },
    _max: { sortOrder: true },
  })
  const baseOrder = (maxOrder._max.sortOrder ?? 0) + 1

  await prisma.listItem.createMany({
    data: items.map((item, i) => ({
      content: item.quantity ? `${item.name} — ${item.quantity}` : item.name,
      listId: list.id,
      createdBy: ctx.user.id,
      sortOrder: baseOrder + i,
    })),
  })

  const itemNames = items.map(i => i.name).join(', ')
  return {
    message: `Added to ${list.name}: ${itemNames}.`,
    action: 'addShoppingListItem',
  }
}

// ── queryShoppingList ─────────────────────────────────────────────────────────

const queryListDefinition: FunctionDeclaration = {
  name: 'queryShoppingList',
  description: "Read back the current contents of the active shopping list. Use this when the user asks \"what's on the shopping list?\" or \"what do I need to buy?\".",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
}

async function queryListHandler(_args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const lists = await prisma.list.findMany({
    where: { familyId: ctx.familyId, isActive: true, type: 'SHOPPING' },
    select: { id: true, name: true },
    take: 1,
  })

  if (lists.length === 0) {
    return { message: 'No active shopping lists found.' }
  }

  const list = lists[0]
  const items = await prisma.listItem.findMany({
    where: { listId: list.id, isCompleted: false },
    select: { content: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (items.length === 0) {
    return { message: `${list.name} is empty.` }
  }

  const lines = items.map(i => `• ${i.content}`).join('\n')
  return { message: `${list.name}:\n${lines}` }
}

// ── completeListItem ──────────────────────────────────────────────────────────

const completeItemDefinition: FunctionDeclaration = {
  name: 'completeListItem',
  description: 'Mark a shopping list or to-do item as done/completed/bought. Use this when the user says "mark milk as bought", "I got the eggs", "tick off X", or "complete the task X".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      itemName: { type: SchemaType.STRING, description: 'The name or partial name of the item to mark complete' },
      listType: { type: SchemaType.STRING, description: 'Optional: "shopping" or "todo" to narrow the search. Omit to search both.' },
    },
    required: ['itemName'],
  },
}

async function completeItemHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { itemName, listType } = args as { itemName: string; listType?: string }
  const lower = itemName.toLowerCase()

  const typeFilter = listType === 'shopping' ? 'SHOPPING' : listType === 'todo' ? 'TODO' : undefined

  const activeLists = await prisma.list.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    select: { id: true, name: true, type: true },
  })

  if (activeLists.length === 0) {
    return { message: 'No active lists found.' }
  }

  const candidates = await prisma.listItem.findMany({
    where: {
      listId: { in: activeLists.map(l => l.id) },
      isCompleted: false,
    },
    select: { id: true, content: true, listId: true },
  })

  const match = candidates.find(c => c.content.toLowerCase().includes(lower))
  if (!match) {
    return { message: `No incomplete item matching "${itemName}" found.` }
  }

  await prisma.listItem.update({
    where: { id: match.id },
    data: { isCompleted: true },
  })

  const listName = activeLists.find(l => l.id === match.listId)?.name ?? 'list'
  return {
    message: `"${match.content}" marked as done in ${listName}.`,
    action: 'completeListItem',
  }
}

// ── categorizeShoppingItems ───────────────────────────────────────────────────

const categorizeItemsDefinition: FunctionDeclaration = {
  name: 'categorizeShoppingItems',
  description: 'Suggest categories for uncategorised shopping list items based on known ingredient mappings. Call this to organise the shopping list by aisle or section.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      listId: { type: SchemaType.STRING, description: 'Optional list ID. Omit to use the active shopping list.' },
    },
  },
}

async function categorizeItemsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { listId } = args as { listId?: string }

  const lists = listId
    ? await prisma.list.findMany({ where: { id: listId, familyId: ctx.familyId, type: 'SHOPPING' }, select: { id: true, name: true }, take: 1 })
    : await prisma.list.findMany({ where: { familyId: ctx.familyId, isActive: true, type: 'SHOPPING' }, select: { id: true, name: true }, take: 1 })

  if (lists.length === 0) {
    return { message: 'No active shopping list found to categorise.' }
  }

  const list = lists[0]

  // Get uncategorised items
  const items = await prisma.listItem.findMany({
    where: { listId: list.id, isCompleted: false, category: null },
    select: { id: true, content: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (items.length === 0) {
    return { message: `${list.name} has no uncategorised items.` }
  }

  // Fetch ingredient mappings for this family
  const mappings = await prisma.ingredientMapping.findMany({
    where: { familyId: ctx.familyId },
    select: { ingredient: true, category: true },
  })

  // Also fetch all ingredient categories for display
  const categories = await prisma.ingredientCategory.findMany({
    where: { familyId: ctx.familyId },
    select: { key: true, category: true, aisle: true },
    orderBy: { sortOrder: 'asc' },
  })

  const categoryMap = new Map(categories.map(c => [c.key, { label: c.category, aisle: c. aisle ?? '' }]))

  // Build mapping lookup (lowercase ingredient -> category key)
  const mappingLookup = new Map<string, string>()
  for (const m of mappings) {
    mappingLookup.set(m.ingredient.toLowerCase(), m.category)
  }

  let categorised = 0
  const results: string[] = []

  for (const item of items) {
    // Try to match item name against ingredient mappings
    const lowerContent = item.content.toLowerCase().trim()
    let matchedCategory: string | null = null

    // Exact match on the full content
    if (mappingLookup.has(lowerContent)) {
      matchedCategory = mappingLookup.get(lowerContent)!
    } else {
      // Partial word match (e.g. "milk 2L" -> check for "milk")
      for (const [ingredient, catKey] of mappingLookup) {
        if (lowerContent.includes(ingredient)) {
          matchedCategory = catKey
          break
        }
      }
    }

    if (matchedCategory) {
      const catInfo = categoryMap.get(matchedCategory)
      const aisle = catInfo?.aisle ? ` (${catInfo.aisle})` : ''
      const categoryName = catInfo?.label ?? matchedCategory

      await prisma.listItem.update({
        where: { id: item.id },
        data: { category: matchedCategory },
      })

      results.push(`• ${item.content} → ${categoryName}${aisle}`)
      categorised++
    }
  }

  if (categorised === 0) {
    return { message: `Could not categorise any items in ${list.name}. Try adding ingredient mappings first.` }
  }

  return {
    message: `Categorised ${categorised} item(s) in ${list.name}:\n${results.join('\n')}`,
    action: 'categorizeShoppingItems',
  }
}

// ── combineDuplicateItems ────────────────────────────────────────────────────

const combineDuplicatesDefinition: FunctionDeclaration = {
  name: 'combineDuplicateItems',
  description: 'Detect and merge duplicate or very similar items on the shopping list (e.g. "Milk" and "milk 2L"). Call this to reduce clutter.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      listId: { type: SchemaType.STRING, description: 'Optional list ID. Omit to use the active shopping list.' },
      autoMerge: { type: SchemaType.BOOLEAN, description: 'Optional: set true to auto-merge without asking. Default false (show suggestions).' },
    },
  },
}

async function combineDuplicatesHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { listId, autoMerge } = args as { listId?: string; autoMerge?: boolean }
  const doAutoMerge = autoMerge === true

  const lists = listId
    ? await prisma.list.findMany({ where: { id: listId, familyId: ctx.familyId, type: 'SHOPPING' }, select: { id: true, name: true }, take: 1 })
    : await prisma.list.findMany({ where: { familyId: ctx.familyId, isActive: true, type: 'SHOPPING' }, select: { id: true, name: true }, take: 1 })

  if (lists.length === 0) {
    return { message: 'No active shopping list found.' }
  }

  const list = lists[0]
  const items = await prisma.listItem.findMany({
    where: { listId: list.id, isCompleted: false },
    select: { id: true, content: true, category: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  })

  // Simple heuristic: group items that share a common base word
  // e.g. "Milk", "milk 2L", "Full cream milk" -> base "milk"
  function extractBase(content: string): string {
    const lower = content.toLowerCase().trim()
    // Take the first significant word (at least 3 chars, not a/and/the)
    const words = lower.split(/[\s,]+/).filter(w => w.length >= 3 && !['the', 'and', 'for', 'with'].includes(w))
    return words[0] ?? lower
  }

  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const base = extractBase(item.content)
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(item)
  }

  // Filter to groups with more than 1 item
  const duplicates = Array.from(groups.entries()).filter(([, group]) => group.length > 1)

  if (duplicates.length === 0) {
    return { message: `${list.name} has no obvious duplicate items.` }
  }

  const lines: string[] = []

  if (doAutoMerge) {
    let merged = 0
    for (const [, group] of duplicates) {
      // Keep the first item, remove the rest
      const [, ...rest] = group
      await prisma.listItem.deleteMany({
        where: { id: { in: rest.map(r => r.id) } },
      })
      merged += rest.length
      lines.push(`• Merged "${group.map(g => g.content).join('", "')}" → kept "${group[0].content}"`)
    }
    return {
      message: `Merged ${merged} duplicate item(s) in ${list.name}:\n${lines.join('\n')}`,
      action: 'combineDuplicateItems',
    }
  }

  // Show suggestions
  for (const [base, group] of duplicates) {
    lines.push(`• "${group.map(g => g.content).join('", "')}" (base: "${base}")`)
  }

  return {
    message: `Found ${duplicates.length} potential duplicate group(s) in ${list.name}. Call again with autoMerge:true to merge:\n${lines.join('\n')}`,
    action: 'combineDuplicateItems',
  }
}

// ── Register all shopping tools ───────────────────────────────────────────────

export function registerShoppingTools(): void {
  registerTool('addShoppingListItem', {
    definition: addItemDefinition,
    contextProvider: shoppingContextProvider,
    handler: addItemHandler,
    actionEvents: { addShoppingListItem: 'app:shoppingListUpdated' },
  })

  registerTool('queryShoppingList', {
    definition: queryListDefinition,
    handler: queryListHandler,
  })

  registerTool('completeListItem', {
    definition: completeItemDefinition,
    contextProvider: shoppingContextProvider,
    handler: completeItemHandler,
    actionEvents: { completeListItem: 'app:shoppingListUpdated' },
  })

  registerTool('categorizeShoppingItems', {
    definition: categorizeItemsDefinition,
    handler: categorizeItemsHandler,
    actionEvents: { categorizeShoppingItems: 'app:shoppingListUpdated' },
  })

  registerTool('combineDuplicateItems', {
    definition: combineDuplicatesDefinition,
    handler: combineDuplicatesHandler,
    actionEvents: { combineDuplicateItems: 'app:shoppingListUpdated' },
  })
}
