import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, FunctionCallingMode } from '@google/generative-ai'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'

// ---------- Gemini function declarations ----------

const functionDeclarations: FunctionDeclaration[] = [
  // ── Meal plan ──────────────────────────────────────────────────────────────
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
    name: 'clearMealPlanSlot',
    description: 'Remove a meal from the meal plan for a specific day and meal type. Use this when the user says "remove dinner on Monday", "clear Tuesday lunch", or "delete the meal on Wednesday".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'ISO date string (YYYY-MM-DD)' },
        mealType: { type: SchemaType.STRING, description: 'One of: breakfast, lunch, dinner, snacks' },
      },
      required: ['date', 'mealType'],
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
  // ── Notes ──────────────────────────────────────────────────────────────────
  {
    name: 'createNote',
    description: 'Create a new note with a title and optional content. Use this when the user says "create a note called X", "new note about X", or dictates note content.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'The title of the note' },
        content: { type: SchemaType.STRING, description: 'The body content of the note (can be empty)' },
      },
      required: ['title'],
    },
  },
  // ── Shopping list ──────────────────────────────────────────────────────────
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
    name: 'queryShoppingList',
    description: 'Read back the current contents of the active shopping list. Use this when the user asks "what\'s on the shopping list?" or "what do I need to buy?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  // ── Todo list ──────────────────────────────────────────────────────────────
  {
    name: 'addTodoItem',
    description: 'Add a task or to-do item to the active to-do list. Use this when the user says "add a task to do X", "remind me to X", or "add to my to-do list: X".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        content: { type: SchemaType.STRING, description: 'The task description' },
        dueDate: { type: SchemaType.STRING, description: 'Optional ISO date string (YYYY-MM-DD) for when the task is due' },
      },
      required: ['content'],
    },
  },
  // ── Calendar events ────────────────────────────────────────────────────────
  {
    name: 'createCalendarEvent',
    description: 'Create a new calendar event. Use this when the user says "add an event", "schedule X on Tuesday", "put X in the calendar", or "create a reminder for X".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'The event title' },
        day: { type: SchemaType.STRING, description: 'Day name like "Monday", "today", "tomorrow", or an ISO date YYYY-MM-DD' },
        startTime: { type: SchemaType.STRING, description: 'Optional start time in 24h format like "14:30" or "9:00". Omit for all-day events.' },
        durationMinutes: { type: SchemaType.NUMBER, description: 'Optional duration in minutes (default: 60). Only used when startTime is provided.' },
        notes: { type: SchemaType.STRING, description: 'Optional description or extra details for the event' },
        isAllDay: { type: SchemaType.BOOLEAN, description: 'Set to true for all-day events with no specific time' },
      },
      required: ['title', 'day'],
    },
  },
  {
    name: 'queryEvents',
    description: 'Look up calendar events for the current week or a specific day. Use this when the user asks "what\'s on this week?", "do I have anything on Tuesday?", or "what\'s happening today?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        day: { type: SchemaType.STRING, description: 'Optional: day name like "Monday" or "today". Omit to get the full week.' },
      },
    },
  },
  // ── Chores ─────────────────────────────────────────────────────────────────
  {
    name: 'completeChore',
    description: 'Mark a chore as done/completed. Use this when the user says "I did X", "mark X as done", "completed the X chore", or "I finished X".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        choreId: { type: SchemaType.STRING, description: 'The ID of the chore to mark complete (from the chores list in context)' },
        note: { type: SchemaType.STRING, description: 'Optional note about the completion' },
      },
      required: ['choreId'],
    },
  },
  {
    name: 'queryChores',
    description: 'Look up chores that are due, overdue, or coming up. Use this when the user asks "what chores are due?", "what needs doing?", or "what are my chores this week?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filter: { type: SchemaType.STRING, description: 'Optional: "overdue" for past-due chores, "upcoming" for next 7 days, "mine" for chores assigned to the current user. Omit for all active chores.' },
      },
    },
  },
  // ── Recipes ────────────────────────────────────────────────────────────────
  {
    name: 'searchRecipes',
    description: 'Search the recipe collection by name or keywords. Use this when the user asks "do we have a recipe for X?", "find recipes with chicken", or "what pasta recipes do we have?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'The search term or recipe name to look for' },
      },
      required: ['query'],
    },
  },
  // ── Fallback ───────────────────────────────────────────────────────────────
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
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone })
  const today = parseISO(todayStr)

  const lower = dayName.toLowerCase().trim()
  if (lower === 'today') return todayStr
  if (lower === 'tomorrow') return format(addDays(today, 1), 'yyyy-MM-dd')

  // If it looks like an ISO date already, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return lower

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(lower)
  if (targetIdx === -1) return todayStr

  const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday-based week
  const candidate = addDays(weekStart, targetIdx === 0 ? 6 : targetIdx - 1)
  const candidateStr = format(candidate, 'yyyy-MM-dd')
  if (candidateStr < todayStr) {
    return format(addDays(candidate, 7), 'yyyy-MM-dd')
  }
  return candidateStr
}

// ---------- Helper: calculate next due date for a chore ----------

function calculateNextDueDateAI(
  chore: { frequency: string; dayOfWeek: number | null; dayOfMonth: number | null; triggerOnComplete: boolean; endDate: Date | null },
  completedAt: Date
): Date | null {
  const baseDate = chore.triggerOnComplete ? completedAt : new Date()
  let next: Date

  switch (chore.frequency) {
    case 'daily': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'weekly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      if (chore.dayOfWeek !== null) {
        const currentDay = next.getDay()
        let daysUntil = chore.dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setDate(next.getDate() + daysUntil)
      } else {
        next.setDate(next.getDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 14)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'monthly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      next.setMonth(next.getMonth() + 1)
      if (chore.dayOfMonth !== null) {
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(chore.dayOfMonth, lastDay))
      }
      break
    }
    default: {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 7)
      next.setHours(0, 0, 0, 0)
    }
  }

  if (chore.endDate && next > chore.endDate) return null
  return next
}

// ---------- POST handler ----------

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { text } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      geminiApiKey: true,
      aiModel: true,
      name: true,
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
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  // Load all context upfront in parallel
  const [recipes, shoppingLists, todoLists, mealPlans, chores, weekEvents] = await Promise.all([
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
    prisma.list.findMany({
      where: { familyId: user.familyId, isActive: true, type: 'TODO' },
      select: { id: true, name: true },
      take: 3,
    }),
    prisma.mealPlan.findMany({
      where: {
        familyId: user.familyId,
        date: {
          gte: new Date(nowStr),
          lte: new Date(weekEndStr + 'T23:59:59Z'),
        },
      },
      include: {
        recipes: { include: { recipe: { select: { title: true } } }, orderBy: { order: 'asc' } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.chore.findMany({
      where: { familyId: user.familyId, isActive: true },
      include: { currentAssignee: { select: { id: true, name: true } } },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.event.findMany({
      where: {
        familyId: user.familyId,
        start: {
          gte: new Date(nowStr + 'T00:00:00Z'),
          lte: new Date(weekEndStr + 'T23:59:59Z'),
        },
      },
      select: { id: true, title: true, start: true, end: true, isAllDay: true, description: true },
      orderBy: { start: 'asc' },
    }),
  ])

  // Build context summaries for the system prompt
  const recipeList = recipes.map(r => `"${r.title}" (id: ${r.id})`).join('\n')

  const shoppingListSummary = shoppingLists.length > 0
    ? shoppingLists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'

  const todoListSummary = todoLists.length > 0
    ? todoLists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'

  const mealPlanSummary = mealPlans.length > 0
    ? mealPlans.map(p => {
        const dateLabel = new Date(p.date).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
        const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
        return `${dateLabel} ${p.mealType}: ${recipeTitles || '(empty)'}`
      }).join('\n')
    : 'No meals planned this week yet.'

  const choresSummary = chores.length > 0
    ? chores.map(c => {
        const due = c.nextDueDate
          ? new Date(c.nextDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
          : 'overdue/now'
        const assignee = c.currentAssignee?.name ?? 'unassigned'
        return `"${c.title}" (id: ${c.id}, due: ${due}, assigned: ${assignee})`
      }).join('\n')
    : 'No active chores.'

  const eventsSummary = weekEvents.length > 0
    ? weekEvents.map(e => {
        const dateLabel = new Date(e.start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: timezone })
        const timeLabel = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
        return `"${e.title}" — ${dateLabel} ${timeLabel}`
      }).join('\n')
    : 'No events this week.'

  const systemPrompt = `You are a helpful AI assistant for a family household management app called HomeBase.
Today is ${nowStr} (${new Date().toLocaleDateString('en-AU', { weekday: 'long', timeZone: timezone })}).
The family's timezone is ${timezone}.
The current user's name is ${userRecord.name}.

Available recipes in the family's recipe collection:
${recipeList || '(none yet)'}

Active shopping lists: ${shoppingListSummary}
Active to-do lists: ${todoListSummary}

Current week's meal plan:
${mealPlanSummary}

Active chores (use the id when calling completeChore):
${choresSummary}

This week's calendar events:
${eventsSummary}

When the user mentions a recipe by name, match it to the closest recipe in the list above (case-insensitive, partial match is fine) and use its ID.
When the user mentions a day like "Monday" or "tomorrow", resolve it to the correct date in the current or upcoming week.
When the user mentions a chore by name, match it to the closest chore in the list above and use its ID.
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
    const textResponse = response.text()
    return NextResponse.json({ message: textResponse || "I didn't understand that. Try asking me to add a recipe to the meal plan, create a note, add items to your shopping list, or ask what's on the calendar." })
  }

  const { name: fnName, args } = part.functionCall

  // ---------- Execute the action ----------

  if (fnName === 'unknown') {
    return NextResponse.json({ message: (args as { message: string }).message })
  }

  // ── queryMealPlan ──────────────────────────────────────────────────────────
  if (fnName === 'queryMealPlan') {
    const { day } = args as { day?: string }
    if (day) {
      const targetDate = resolveDayToDate(day, timezone)
      const dayPlans = mealPlans.filter(p => {
        const planDate = new Date(p.date).toLocaleDateString('en-CA', { timeZone: 'UTC' })
        return planDate === targetDate
      })
      const dayLabel = new Date(targetDate + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
      if (dayPlans.length === 0) {
        return NextResponse.json({ message: `Nothing planned for ${dayLabel} yet.` })
      }
      const lines = dayPlans.map(p => {
        const recipeTitles = p.recipes.map(r => r.recipe.title).join(', ')
        return `${p.mealType}: ${recipeTitles || '(empty)'}`
      })
      return NextResponse.json({ message: `${dayLabel}:\n${lines.join('\n')}` })
    }
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

  // ── addRecipeToMealPlan ────────────────────────────────────────────────────
  if (fnName === 'addRecipeToMealPlan') {
    const { recipeId, date, mealType } = args as { recipeId: string; date: string; mealType: string }

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
    await prisma.mealPlanRecipe.deleteMany({ where: { mealPlanId: plan.id } })
    await prisma.mealPlanRecipe.create({
      data: { mealPlanId: plan.id, recipeId, order: 0 },
    })

    return NextResponse.json({
      message: `${recipe.title} added to ${dayLabel} ${mealType}.`,
      action: 'addRecipeToMealPlan',
    })
  }

  // ── clearMealPlanSlot ──────────────────────────────────────────────────────
  if (fnName === 'clearMealPlanSlot') {
    const { date, mealType } = args as { date: string; mealType: string }
    const normalized = new Date(date + 'T00:00:00Z')
    const existing = await prisma.mealPlan.findFirst({
      where: { familyId: user.familyId, date: normalized, mealType },
    })
    if (!existing) {
      const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
      return NextResponse.json({ message: `No ${mealType} planned for ${dayLabel}.` })
    }
    await prisma.mealPlan.delete({ where: { id: existing.id } })
    const dayLabel = normalized.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    return NextResponse.json({
      message: `${dayLabel} ${mealType} cleared.`,
      action: 'clearMealPlanSlot',
    })
  }

  // ── createNote ─────────────────────────────────────────────────────────────
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

  // ── addShoppingListItem ────────────────────────────────────────────────────
  if (fnName === 'addShoppingListItem') {
    const { items } = args as { items: Array<{ name: string; quantity?: string }> }

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

  // ── queryShoppingList ──────────────────────────────────────────────────────
  if (fnName === 'queryShoppingList') {
    if (shoppingLists.length === 0) {
      return NextResponse.json({ message: 'No active shopping lists found.' })
    }
    const list = shoppingLists[0]
    const items = await prisma.listItem.findMany({
      where: { listId: list.id, isCompleted: false },
      select: { content: true },
      orderBy: { sortOrder: 'asc' },
    })
    if (items.length === 0) {
      return NextResponse.json({ message: `${list.name} is empty.` })
    }
    const lines = items.map(i => `• ${i.content}`).join('\n')
    return NextResponse.json({ message: `${list.name}:\n${lines}` })
  }

  // ── addTodoItem ────────────────────────────────────────────────────────────
  if (fnName === 'addTodoItem') {
    const { content, dueDate } = args as { content: string; dueDate?: string }

    let list = todoLists[0]
    if (!list) {
      const created = await prisma.list.create({
        data: { name: 'To Do', type: 'TODO', familyId: user.familyId },
      })
      list = { id: created.id, name: created.name }
    }

    const maxOrder = await prisma.listItem.aggregate({
      where: { listId: list.id },
      _max: { sortOrder: true },
    })
    const nextOrder = (maxOrder._max.sortOrder ?? 0) + 1

    await prisma.listItem.create({
      data: {
        content,
        listId: list.id,
        createdBy: user.id,
        sortOrder: nextOrder,
        dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
      },
    })

    const duePart = dueDate ? ` (due ${new Date(dueDate + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })})` : ''
    return NextResponse.json({
      message: `Task added to ${list.name}: ${content}${duePart}.`,
      action: 'addTodoItem',
    })
  }

  // ── createCalendarEvent ────────────────────────────────────────────────────
  if (fnName === 'createCalendarEvent') {
    const { title, day, startTime, durationMinutes, notes, isAllDay } = args as {
      title: string
      day: string
      startTime?: string
      durationMinutes?: number
      notes?: string
      isAllDay?: boolean
    }

    const dateStr = resolveDayToDate(day, timezone)
    let start: Date
    let end: Date
    let allDay = isAllDay ?? false

    if (startTime && !allDay) {
      // Parse HH:MM time and combine with date in user's timezone
      const [hours, minutes] = startTime.split(':').map(Number)
      // Build a date string in the target timezone
      const startIso = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes ?? 0).padStart(2, '0')}:00`
      // Create the date treating the input as local to the family's timezone
      const offsetDate = new Date(new Date(startIso).toLocaleString('en-US', { timeZone: timezone }))
      const utcOffset = new Date(startIso).getTime() - offsetDate.getTime()
      start = new Date(new Date(startIso).getTime() + utcOffset)
      end = new Date(start.getTime() + (durationMinutes ?? 60) * 60 * 1000)
    } else {
      // All-day event
      allDay = true
      start = new Date(dateStr + 'T00:00:00Z')
      end = new Date(dateStr + 'T23:59:59Z')
    }

    const event = await prisma.event.create({
      data: {
        title,
        description: notes ?? null,
        start,
        end,
        isAllDay: allDay,
        createdBy: user.id,
        familyId: user.familyId,
      },
    })

    const dayLabel = start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
    const timePart = allDay ? '' : ` at ${start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}`
    return NextResponse.json({
      message: `Event "${title}" created for ${dayLabel}${timePart}.`,
      action: 'createCalendarEvent',
      eventId: event.id,
    })
  }

  // ── queryEvents ────────────────────────────────────────────────────────────
  if (fnName === 'queryEvents') {
    const { day } = args as { day?: string }
    if (day) {
      const targetDate = resolveDayToDate(day, timezone)
      const dayEvents = weekEvents.filter(e => {
        const eventDate = new Date(e.start).toLocaleDateString('en-CA', { timeZone: timezone })
        return eventDate === targetDate
      })
      const dayLabel = new Date(targetDate + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
      if (dayEvents.length === 0) {
        return NextResponse.json({ message: `Nothing in the calendar for ${dayLabel}.` })
      }
      const lines = dayEvents.map(e => {
        const timePart = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
        return `• ${e.title} (${timePart})`
      })
      return NextResponse.json({ message: `${dayLabel}:\n${lines.join('\n')}` })
    }
    if (weekEvents.length === 0) {
      return NextResponse.json({ message: 'No events in the calendar this week.' })
    }
    const lines = weekEvents.map(e => {
      const dateLabel = new Date(e.start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: timezone })
      const timePart = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
      return `• ${e.title} — ${dateLabel} ${timePart}`
    })
    return NextResponse.json({ message: `This week's events:\n${lines.join('\n')}` })
  }

  // ── completeChore ──────────────────────────────────────────────────────────
  if (fnName === 'completeChore') {
    const { choreId, note } = args as { choreId: string; note?: string }

    const chore = await prisma.chore.findFirst({
      where: { id: choreId, familyId: user.familyId },
    })
    if (!chore) {
      return NextResponse.json({ error: 'Chore not found.' }, { status: 404 })
    }

    await prisma.choreCompletion.create({
      data: { choreId, completedById: user.id, note: note ?? null },
    })

    const completedAt = new Date()
    const nextDueDate = calculateNextDueDateAI(chore, completedAt)

    if (nextDueDate === null) {
      await prisma.chore.update({ where: { id: choreId }, data: { isActive: false, nextDueDate: null } })
    } else {
      await prisma.chore.update({ where: { id: choreId }, data: { nextDueDate } })
    }

    const nextPart = nextDueDate
      ? ` Next due: ${nextDueDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}.`
      : ' Chore completed for the last time.'
    return NextResponse.json({
      message: `"${chore.title}" marked as done.${nextPart}`,
      action: 'completeChore',
    })
  }

  // ── queryChores ────────────────────────────────────────────────────────────
  if (fnName === 'queryChores') {
    const { filter } = args as { filter?: string }
    const todayDate = parseISO(nowStr)
    const nextWeek = addDays(todayDate, 7)

    let filtered = chores
    if (filter === 'overdue') {
      filtered = chores.filter(c => c.nextDueDate && new Date(c.nextDueDate) < todayDate)
    } else if (filter === 'upcoming') {
      filtered = chores.filter(c => c.nextDueDate && new Date(c.nextDueDate) <= nextWeek)
    } else if (filter === 'mine') {
      filtered = chores.filter(c => c.currentAssigneeId === user.id)
    }

    if (filtered.length === 0) {
      const label = filter === 'overdue' ? 'overdue chores' : filter === 'upcoming' ? 'upcoming chores' : filter === 'mine' ? 'chores assigned to you' : 'active chores'
      return NextResponse.json({ message: `No ${label} found.` })
    }

    const lines = filtered.map(c => {
      const due = c.nextDueDate
        ? new Date(c.nextDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
        : 'overdue'
      const assignee = c.currentAssignee?.name ?? 'unassigned'
      return `• ${c.title} — due ${due}, assigned to ${assignee}`
    })
    return NextResponse.json({ message: lines.join('\n') })
  }

  // ── searchRecipes ──────────────────────────────────────────────────────────
  if (fnName === 'searchRecipes') {
    const { query } = args as { query: string }
    const lower = query.toLowerCase()
    const matches = recipes.filter(r => r.title.toLowerCase().includes(lower))
    if (matches.length === 0) {
      return NextResponse.json({ message: `No recipes found matching "${query}".` })
    }
    const lines = matches.map(r => `• ${r.title}`).join('\n')
    return NextResponse.json({ message: `Found ${matches.length} recipe${matches.length > 1 ? 's' : ''} matching "${query}":\n${lines}` })
  }

  return NextResponse.json({ message: 'Action not recognised.' })
}
