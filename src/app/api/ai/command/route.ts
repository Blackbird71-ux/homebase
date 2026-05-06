import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, FunctionCallingMode } from '@google/generative-ai'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'

// ---------- Gemini function declarations ----------

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'addRecipeToMealPlan',
    description: 'Add a recipe to the meal plan on a specific date and meal type (breakfast, lunch, dinner, snacks). Use this when the user says things like "add X to Monday dinner" or "put pasta on Tuesday lunch".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        recipeId: { type: SchemaType.STRING, description: 'The ID of the recipe to add' },
        date: { type: SchemaType.STRING, description: 'ISO date string (YYYY-MM-DD) for the meal plan day' },
        mealType: { type: SchemaType.STRING, description: 'One of: breakfast, lunch, dinner, snacks' },
      },
      required: ['recipeId', 'date', 'mealType'],
    },
  },
  {
    name: 'createNote',
    description: 'Create a new note with a title and optional content. Use this when the user says "create a note called X" or "new note about X" or dictates note content.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'The title of the note' },
        content: { type: SchemaType.STRING, description: 'The body content of the note (can be empty)' },
      },
      required: ['title'],
    },
  },
  {
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
  },
  {
    name: 'queryMealPlan',
    description: 'Look up what meals are planned for the current week or a specific day. Use this when the user asks "what\'s for dinner?" or "what\'s planned this week?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        day: { type: SchemaType.STRING, description: 'Optional: day name like "Monday" or "today" to query a specific day. Omit to get the full week.' },
      },
    },
  },
  {
    name: 'unknown',
    description: 'Use this when the request cannot be matched to any available action, or to ask a clarifying question.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: { type: SchemaType.STRING, description: 'A helpful response explaining what you can and cannot do, or asking for clarification' },
      },
      required: ['message'],
    },
  },
]

// ---------- Helper: resolve a day name to an ISO date ----------

function resolveDayToDate(dayName: string, userTimezone: string): string {
  const now = new Date()
  // Use the user's timezone to get the correct "today"
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone }) // en-CA gives YYYY-MM-DD
  const today = parseISO(todayStr)

  const lower = dayName.toLowerCase().trim()
  if (lower === 'today') return todayStr
  if (lower === 'tomorrow') return format(addDays(today, 1), 'yyyy-MM-dd')

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(lower)
  if (targetIdx === -1) return todayStr // fallback to today

  const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday-based week
  const candidate = addDays(weekStart, targetIdx === 0 ? 6 : targetIdx - 1)
  // If the candidate is in the past (before today), move to next week
  const candidateStr = format(candidate, 'yyyy-MM-dd')
  if (candidateStr < todayStr) {
    return format(addDays(candidate, 7), 'yyyy-MM-dd')
  }
  return candidateStr
}

// ---------- POST handler ----------

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { text } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Fetch the user's stored Gemini key and model
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      geminiApiKey: true,
      aiModel: true,
      family: { select: { timezone: true } },
    },
  })

  if (!userRecord?.geminiApiKey) {
    return NextResponse.json(
      { error: 'No Gemini API key configured. Go to Settings → AI to add your key.' },
      { status: 400 }
    )
  }

  const model = userRecord.aiModel ?? 'gemini-2.0-flash'
  const timezone = userRecord.family?.timezone ?? 'UTC'
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

  // Load context for the AI: recipe names, active shopping lists
  const [recipes, shoppingLists, mealPlans] = await Promise.all([
    prisma.recipe.findMany({
      where: { familyId: user.familyId },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, isActive: true, type: 'SHOPPING' },
      select: { id: true, name: true },
      take: 5,
    }),
    prisma.mealPlan.findMany({
      where: {
        familyId: user.familyId,
        date: {
          gte: new Date(nowStr),
          lte: new Date(format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd') + 'T23:59:59Z'),
        },
      },
      include: {
        recipes: { include: { recipe: { select: { title: true } } }, orderBy: { order: 'asc' } },
      },
      orderBy: { date: 'asc' },
    }),
  ])

  const recipeList = recipes.map(r => `"${r.title}" (id: ${r.id})`).join('\n')
  const shoppingListSummary = shoppingLists.length > 0
    ? shoppingLists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'

  const mealPlanSummary = mealPlans.length > 0
    ? mealPlans.map(p => {
        const dateLabel = new Date(p.date).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
        const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
        return `${dateLabel} ${p.mealType}: ${recipeTitles || '(empty)'}`
      }).join('\n')
    : 'No meals planned this week yet.'

  const systemPrompt = `You are a helpful AI assistant for a family household management app called HomeBase.
Today is ${nowStr} (${new Date().toLocaleDateString('en-AU', { weekday: 'long', timeZone: timezone })}).
The family's timezone is ${timezone}.

Available recipes in the family's recipe collection:
${recipeList || '(none yet)'}

Active shopping lists: ${shoppingListSummary}

Current week's meal plan:
${mealPlanSummary}

When the user mentions a recipe by name, match it to the closest recipe in the list above (case-insensitive, partial match is fine) and use its ID.
When the user mentions a day like "Monday" or "tomorrow", resolve it to the correct date in the current or upcoming week.
Always use function calls to perform actions — do not just describe what you would do.`

  // Call Gemini
  const genAI = new GoogleGenerativeAI(userRecord.geminiApiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } },
    systemInstruction: systemPrompt,
  })

  const result = await geminiModel.generateContent(text)
  const response = result.response

  const candidate = response.candidates?.[0]
  const part = candidate?.content?.parts?.[0]

  if (!part?.functionCall) {
    // Fallback to text if no function call
    const textResponse = response.text()
    return NextResponse.json({ message: textResponse || "I didn't understand that. Try asking me to add a recipe to the meal plan, create a note, or add items to your shopping list." })
  }

  const { name: fnName, args } = part.functionCall

  // ---------- Execute the action ----------

  if (fnName === 'unknown') {
    return NextResponse.json({ message: (args as { message: string }).message })
  }

  if (fnName === 'queryMealPlan') {
    const { day } = args as { day?: string }
    if (day) {
      const targetDate = resolveDayToDate(day, timezone)
      const dayPlans = mealPlans.filter(p => {
        const planDate = new Date(p.date).toLocaleDateString('en-CA', { timeZone: 'UTC' })
        return planDate === targetDate
      })
      if (dayPlans.length === 0) {
        const dayLabel = new Date(targetDate).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
        return NextResponse.json({ message: `Nothing planned for ${dayLabel} yet.` })
      }
      const lines = dayPlans.map(p => {
        const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
        return `${p.mealType}: ${recipeTitles || '(empty)'}`
      })
      const dayLabel = new Date(targetDate).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
      return NextResponse.json({ message: `${dayLabel}:\n${lines.join('\n')}` })
    }
    // Full week
    if (mealPlans.length === 0) {
      return NextResponse.json({ message: 'No meals planned this week yet.' })
    }
    const lines = mealPlans.map(p => {
      const dateLabel = new Date(p.date).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
      const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
      return `${dateLabel} ${p.mealType}: ${recipeTitles || '(empty)'}`
    })
    return NextResponse.json({ message: lines.join('\n') })
  }

  if (fnName === 'addRecipeToMealPlan') {
    const { recipeId, date, mealType } = args as { recipeId: string; date: string; mealType: string }

    // Verify recipe belongs to this family
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, familyId: user.familyId },
      select: { title: true },
    })
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 })
    }

    const normalized = new Date(date + 'T00:00:00Z')
    const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })

    const plan = await prisma.mealPlan.upsert({
      where: { familyId_date_mealType: { familyId: user.familyId, date: normalized, mealType } },
      create: { date: normalized, mealType, familyId: user.familyId, recipeId },
      update: { recipeId },
    })

    // Replace meal plan recipes
    await prisma.mealPlanRecipe.deleteMany({ where: { mealPlanId: plan.id } })
    await prisma.mealPlanRecipe.create({
      data: { mealPlanId: plan.id, recipeId, order: 0 },
    })

    return NextResponse.json({
      message: `${recipe.title} added to ${dayLabel} ${mealType}.`,
      action: 'addRecipeToMealPlan',
    })
  }

  if (fnName === 'createNote') {
    const { title, content } = args as { title: string; content?: string }

    const note = await prisma.note.create({
      data: {
        title,
        content: content || '',
        createdBy: user.id,
        familyId: user.familyId,
      },
    })

    return NextResponse.json({
      message: `Note "${title}" created.`,
      action: 'createNote',
      noteId: note.id,
    })
  }

  if (fnName === 'addShoppingListItem') {
    const { items } = args as { items: Array<{ name: string; quantity?: string }> }

    // Use the first active shopping list, or create one
    let list = shoppingLists[0]
    if (!list) {
      const created = await prisma.list.create({
        data: { name: 'Shopping List', type: 'SHOPPING', familyId: user.familyId },
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
        createdBy: user.id,
        sortOrder: baseOrder + i,
      })),
    })

    const itemNames = items.map(i => i.name).join(', ')
    return NextResponse.json({
      message: `Added to ${list.name}: ${itemNames}.`,
      action: 'addShoppingListItem',
    })
  }

  return NextResponse.json({ message: 'Action not recognised.' })
}
