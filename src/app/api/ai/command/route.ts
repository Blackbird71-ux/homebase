import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, FunctionCallingMode } from '@google/generative-ai'
import OpenAI from 'openai'
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
  {
    name: 'generateShoppingList',
    description: 'Add all ingredients from this week\'s planned recipes to the shopping list. Use this when the user says "add this week\'s ingredients to the shopping list", "generate a shopping list from the meal plan", or "what do I need to buy for this week\'s meals?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        confirm: { type: SchemaType.BOOLEAN, description: 'Always set to true — the user has explicitly requested this.' },
      },
      required: ['confirm'],
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
  {
    name: 'queryNotes',
    description: 'Search notes by keyword. Use this when the user asks "do I have any notes about X?", "find my note on Y", or "what did I write about Z?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'The keyword or phrase to search for in note titles and content' },
      },
      required: ['query'],
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
  {
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
  {
    name: 'getRecipeIngredients',
    description: 'Get the ingredient list for a specific recipe. Use this when the user asks "what do I need for X?", "what are the ingredients in X?", or "how do I make X?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        recipeId: { type: SchemaType.STRING, description: 'The ID of the recipe (from the recipes list in context)' },
      },
      required: ['recipeId'],
    },
  },
  // ── Contacts ───────────────────────────────────────────────────────────────
  {
    name: 'lookupContact',
    description: 'Look up a household contact by name or category. Use this when the user asks "what\'s the dentist\'s number?", "find the plumber\'s details", or "what\'s the school\'s phone number?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'The name or category to search for (e.g. "dentist", "school", "plumber")' },
      },
      required: ['query'],
    },
  },
  // ── Birthdays ──────────────────────────────────────────────────────────────
  {
    name: 'queryBirthdays',
    description: 'Check upcoming birthdays or anniversaries. Use this when the user asks "any birthdays coming up?", "whose birthday is this month?", or "when is X\'s birthday?".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Optional: a name or month to filter by, e.g. "May" or "Sarah". Omit to see all upcoming birthdays in the next 60 days.' },
      },
    },
  },
  // ── Documents ──────────────────────────────────────────────────────────────
  {
    name: 'queryDocuments',
    description: 'Look up stored documents, particularly those expiring soon. Use this when the user asks "any documents expiring soon?", "when does our insurance expire?", or "find the X document".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Optional: search term or category like "insurance", "passport", "warranty". Omit to show documents expiring within 90 days.' },
        expiringOnly: { type: SchemaType.BOOLEAN, description: 'Set to true to only show documents with upcoming expiry dates' },
      },
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return lower

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(lower)
  if (targetIdx === -1) return todayStr

  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
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

// ---------- Helper: safe JSON parse to string array ----------

function safeParseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// ---------- Provider adapter ----------

const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
}

type AIResult =
  | { fnName: string; args: Record<string, unknown> }
  | { textResponse: string }

async function callAIProvider(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  text: string
): Promise<AIResult> {
  if (provider !== 'gemini') {
    const openai = new OpenAI({ apiKey, baseURL: PROVIDER_BASE_URLS[provider] })
    const tools: OpenAI.ChatCompletionTool[] = functionDeclarations.map(fn => ({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description ?? '',
        parameters: fn.parameters as unknown as Record<string, unknown>,
      },
    }))
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      tools,
      tool_choice: 'required',
    })
    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall || toolCall.type !== 'function') {
      return { textResponse: response.choices[0]?.message?.content ?? "I didn't understand that." }
    }
    return {
      fnName: toolCall.function.name,
      args: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
    }
  }

  // Gemini
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } },
    systemInstruction: systemPrompt,
  })
  const result = await geminiModel.generateContent(text)
  const response = result.response
  const part = response.candidates?.[0]?.content?.parts?.[0]
  if (!part?.functionCall) {
    return { textResponse: response.text() ?? "I didn't understand that." }
  }
  return {
    fnName: part.functionCall.name,
    args: part.functionCall.args as Record<string, unknown>,
  }
}

// ---------- POST handler ----------

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireSession>>
  try {
    user = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { text } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    return await handleCommand(user, text)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handleCommand(user: Awaited<ReturnType<typeof requireSession>>, text: string) {

  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      aiApiKey: true,
      aiProvider: true,
      aiModel: true,
      name: true,
      family: { select: { timezone: true, birthdays: true } },
    },
  })

  if (!userRecord?.aiApiKey) {
    return NextResponse.json(
      { error: 'No AI API key configured. Go to Settings → AI to add your key.' },
      { status: 400 }
    )
  }

  const provider = userRecord.aiProvider ?? 'gemini'
  const defaultModel = provider === 'deepseek' ? 'deepseek-chat' : 'gemini-2.0-flash'
  const model = userRecord.aiModel ?? defaultModel
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

  // Build context summaries
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

  // Parse upcoming birthdays for context
  const birthdayRaw = userRecord.family?.birthdays ?? null
  const birthdayList: Array<{ name: string; type: string; date: string }> = birthdayRaw
    ? (() => { try { return JSON.parse(birthdayRaw) } catch { return [] } })()
    : []
  const birthdaySummary = birthdayList.length > 0
    ? birthdayList.map(b => `${b.name} (${b.type}): ${b.date}`).join(', ')
    : 'none stored'

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

Stored birthdays/anniversaries: ${birthdaySummary}

IMPORTANT RULES FOR RECIPE MATCHING:
- When the user mentions a recipe by name, search the recipe list above for matches.
- If you find EXACTLY ONE clear match (case-insensitive, partial match is fine), use its ID and proceed.
- If you find MULTIPLE close matches (e.g. "pasta" matches "Spaghetti Bolognese", "Pasta Bake", "Chicken Pasta"), do NOT guess. Instead, use the "unknown" function to ask the user which one they meant. List the matching options.
- If you find NO match, use the "unknown" function to tell the user you couldn't find that recipe and ask if they'd like to add it as a quick item or search for something else.
- When the user mentions a day like "Monday" or "tomorrow", resolve it to the correct date in the current or upcoming week.
- When the user mentions a chore by name, match it to the closest chore in the list above and use its ID.
- Always use function calls to perform actions — do not just describe what you would do.`


  // Call AI provider
  const aiResult = await callAIProvider(provider, userRecord.aiApiKey, model, systemPrompt, text)

  if ('textResponse' in aiResult) {
    return NextResponse.json({ message: aiResult.textResponse || "I didn't understand that. Try asking me to add a recipe to the meal plan, create a note, add items to your shopping list, or ask what's on the calendar." })
  }

  const { fnName, args } = aiResult

  // ── unknown ────────────────────────────────────────────────────────────────
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

    // Notify the frontend to refresh
    if (typeof globalThis !== 'undefined') {
      try {
        const { dispatchAppEvent } = await import('@/lib/app-events')
        // This runs on the server, so we can't dispatch browser events here.
        // The response includes action type so the client can dispatch.
      } catch {}
    }

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

  // ── generateShoppingList ───────────────────────────────────────────────────
  if (fnName === 'generateShoppingList') {
    // Collect all unique recipe IDs from this week's meal plan
    const recipeIds = new Set<string>()
    for (const plan of mealPlans) {
      for (const r of plan.recipes) {
        if ((r as { recipeId?: string }).recipeId) {
          recipeIds.add((r as { recipeId: string }).recipeId)
        }
      }
    }

    // Also collect from the MealPlan.recipeId field (legacy)
    const planRecipeIds = await prisma.mealPlanRecipe.findMany({
      where: { mealPlanId: { in: mealPlans.map(p => p.id) } },
      select: { recipeId: true },
    })
    for (const r of planRecipeIds) recipeIds.add(r.recipeId)

    if (recipeIds.size === 0) {
      return NextResponse.json({ message: 'No recipes in this week\'s meal plan to generate a list from.' })
    }

    // Load full ingredient lists for those recipes
    const recipeDetails = await prisma.recipe.findMany({
      where: { id: { in: Array.from(recipeIds) }, familyId: user.familyId },
      select: { title: true, ingredients: true },
    })

    const allIngredients: string[] = []
    for (const r of recipeDetails) {
      const parsed = safeParseStringArray(r.ingredients)
      allIngredients.push(...parsed)
    }

    if (allIngredients.length === 0) {
      return NextResponse.json({ message: 'Recipes found but no ingredients to add.' })
    }

    // Get or create the shopping list
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
      data: allIngredients.map((ingredient, i) => ({
        content: ingredient,
        listId: list.id,
        createdBy: user.id,
        sortOrder: baseOrder + i,
      })),
    })

    const recipeNames = recipeDetails.map(r => r.title).join(', ')
    return NextResponse.json({
      message: `Added ${allIngredients.length} ingredients from ${recipeDetails.length} recipe${recipeDetails.length > 1 ? 's' : ''} (${recipeNames}) to ${list.name}.`,
      action: 'generateShoppingList',
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

  // ── queryNotes ─────────────────────────────────────────────────────────────
  if (fnName === 'queryNotes') {
    const { query } = args as { query: string }
    const lower = query.toLowerCase()

    const notes = await prisma.note.findMany({
      where: {
        familyId: user.familyId,
        OR: [
          { title: { contains: query } },
          { content: { contains: query } },
        ],
      },
      select: { id: true, title: true, content: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })

    // SQLite contains is case-sensitive; do a secondary client-side filter for case-insensitivity
    const matched = notes.filter(n =>
      n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
    )

    if (matched.length === 0) {
      return NextResponse.json({ message: `No notes found matching "${query}".` })
    }

    const lines = matched.map(n => {
      const snippet = n.content.length > 80 ? n.content.slice(0, 80).trimEnd() + '…' : n.content
      return `• ${n.title}${snippet ? `: ${snippet}` : ''}`
    })
    return NextResponse.json({ message: `Found ${matched.length} note${matched.length > 1 ? 's' : ''} matching "${query}":\n${lines.join('\n')}` })
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

  // ── completeListItem ───────────────────────────────────────────────────────
  if (fnName === 'completeListItem') {
    const { itemName, listType } = args as { itemName: string; listType?: string }
    const lower = itemName.toLowerCase()

    // Determine which list types to search
    const typeFilter = listType === 'shopping' ? 'SHOPPING' : listType === 'todo' ? 'TODO' : undefined

    const activeLists = await prisma.list.findMany({
      where: {
        familyId: user.familyId,
        isActive: true,
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      select: { id: true, name: true, type: true },
    })

    if (activeLists.length === 0) {
      return NextResponse.json({ message: 'No active lists found.' })
    }

    // Find matching incomplete item across all relevant lists
    const candidates = await prisma.listItem.findMany({
      where: {
        listId: { in: activeLists.map(l => l.id) },
        isCompleted: false,
      },
      select: { id: true, content: true, listId: true },
    })

    const match = candidates.find(c => c.content.toLowerCase().includes(lower))
    if (!match) {
      return NextResponse.json({ message: `No incomplete item matching "${itemName}" found.` })
    }

    await prisma.listItem.update({
      where: { id: match.id },
      data: { isCompleted: true },
    })

    const listName = activeLists.find(l => l.id === match.listId)?.name ?? 'list'
    return NextResponse.json({
      message: `"${match.content}" marked as done in ${listName}.`,
      action: 'completeListItem',
    })
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
      const [hours, minutes] = startTime.split(':').map(Number)
      const startIso = `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes ?? 0).padStart(2, '0')}:00`
      const offsetDate = new Date(new Date(startIso).toLocaleString('en-US', { timeZone: timezone }))
      const utcOffset = new Date(startIso).getTime() - offsetDate.getTime()
      start = new Date(new Date(startIso).getTime() + utcOffset)
      end = new Date(start.getTime() + (durationMinutes ?? 60) * 60 * 1000)
    } else {
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

  // ── getRecipeIngredients ───────────────────────────────────────────────────
  if (fnName === 'getRecipeIngredients') {
    const { recipeId } = args as { recipeId: string }

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, familyId: user.familyId },
      select: { title: true, ingredients: true, servings: true },
    })
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 })
    }

    const ingredients = safeParseStringArray(recipe.ingredients)
    if (ingredients.length === 0) {
      return NextResponse.json({ message: `${recipe.title} has no ingredients listed.` })
    }

    const servingsPart = recipe.servings ? ` (serves ${recipe.servings})` : ''
    const lines = ingredients.map(i => `• ${i}`).join('\n')
    return NextResponse.json({ message: `${recipe.title}${servingsPart}:\n${lines}` })
  }

  // ── lookupContact ──────────────────────────────────────────────────────────
  if (fnName === 'lookupContact') {
    const { query } = args as { query: string }
    const lower = query.toLowerCase()

    const contacts = await prisma.householdContact.findMany({
      where: { familyId: user.familyId },
      select: { name: true, category: true, phone: true, email: true, address: true, notes: true, pinHash: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })

    const matches = contacts.filter(c =>
      c.name.toLowerCase().includes(lower) || c.category.toLowerCase().includes(lower)
    )

    if (matches.length === 0) {
      return NextResponse.json({ message: `No contacts found matching "${query}".` })
    }

    const lines = matches.map(c => {
      if (c.pinHash) {
        return `• ${c.name} (${c.category}) — PIN protected`
      }
      const details: string[] = []
      if (c.phone) details.push(`📞 ${c.phone}`)
      if (c.email) details.push(`✉️ ${c.email}`)
      if (c.address) details.push(`📍 ${c.address}`)
      if (c.notes) details.push(`Note: ${c.notes}`)
      return `• ${c.name} (${c.category})${details.length ? '\n  ' + details.join('  ') : ' — no details stored'}`
    })
    return NextResponse.json({ message: lines.join('\n') })
  }

  // ── queryBirthdays ─────────────────────────────────────────────────────────
  if (fnName === 'queryBirthdays') {
    const { query } = args as { query?: string }

    if (birthdayList.length === 0) {
      return NextResponse.json({ message: 'No birthdays or anniversaries stored. Add them in Settings → Family.' })
    }

    const today = parseISO(nowStr)
    const currentYear = today.getFullYear()

    // Enrich with next occurrence and days until
    const enriched = birthdayList
      .map(b => {
        // date format: "MM-DD" or "YYYY-MM-DD"
        const parts = b.date.split('-')
        const month = parseInt(parts[parts.length - 2]) - 1  // 0-indexed
        const day = parseInt(parts[parts.length - 1])
        let next = new Date(currentYear, month, day)
        if (next < today) next = new Date(currentYear + 1, month, day)
        const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return { ...b, next, daysUntil }
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)

    let filtered = enriched
    if (query) {
      const lower = query.toLowerCase()
      const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december']
      const monthIdx = monthNames.findIndex(m => m.startsWith(lower))
      if (monthIdx >= 0) {
        filtered = enriched.filter(b => b.next.getMonth() === monthIdx)
      } else {
        filtered = enriched.filter(b => b.name.toLowerCase().includes(lower))
      }
    } else {
      // Default: next 60 days
      filtered = enriched.filter(b => b.daysUntil <= 60)
    }

    if (filtered.length === 0) {
      return NextResponse.json({ message: query ? `No birthdays found matching "${query}".` : 'No birthdays in the next 60 days.' })
    }

    const lines = filtered.map(b => {
      const dateStr = b.next.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      const countdown = b.daysUntil === 0 ? ' — TODAY!' : b.daysUntil === 1 ? ' — tomorrow!' : ` — in ${b.daysUntil} days`
      return `• ${b.name} (${b.type}) — ${dateStr}${countdown}`
    })
    return NextResponse.json({ message: lines.join('\n') })
  }

  // ── queryDocuments ─────────────────────────────────────────────────────────
  if (fnName === 'queryDocuments') {
    const { query, expiringOnly } = args as { query?: string; expiringOnly?: boolean }

    const documents = await prisma.document.findMany({
      where: { familyId: user.familyId },
      select: { title: true, category: true, expiryDate: true, notes: true, pinHash: true, fileName: true },
      orderBy: { expiryDate: 'asc' },
    })

    if (documents.length === 0) {
      return NextResponse.json({ message: 'No documents stored.' })
    }

    const today = parseISO(nowStr)
    const ninetyDays = addDays(today, 90)

    let filtered = documents
    if (query) {
      const lower = query.toLowerCase()
      filtered = documents.filter(d =>
        d.title.toLowerCase().includes(lower) ||
        d.category.toLowerCase().includes(lower) ||
        (d.notes ?? '').toLowerCase().includes(lower)
      )
    } else if (expiringOnly) {
      filtered = documents.filter(d => d.expiryDate && new Date(d.expiryDate) <= ninetyDays)
    } else {
      // Default: show documents expiring within 90 days
      filtered = documents.filter(d => d.expiryDate && new Date(d.expiryDate) <= ninetyDays)
      if (filtered.length === 0) {
        // Fallback: show all if nothing is expiring
        filtered = documents
      }
    }

    if (filtered.length === 0) {
      return NextResponse.json({ message: query ? `No documents found matching "${query}".` : 'No documents expiring in the next 90 days.' })
    }

    const lines = filtered.map(d => {
      if (d.pinHash) {
        return `• ${d.title} (${d.category}) — PIN protected`
      }
      const expiry = d.expiryDate
        ? (() => {
            const exp = new Date(d.expiryDate)
            const daysLeft = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            const expStr = exp.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
            if (daysLeft < 0) return `expired ${Math.abs(daysLeft)} days ago (${expStr})`
            if (daysLeft === 0) return `expires TODAY (${expStr})`
            return `expires ${expStr} (${daysLeft} days)`
          })()
        : 'no expiry date'
      const notePart = d.notes ? ` — ${d.notes}` : ''
      return `• ${d.title} (${d.category}) — ${expiry}${notePart}`
    })
    return NextResponse.json({ message: lines.join('\n') })
  }

  return NextResponse.json({ message: 'Action not recognised.' })
}

