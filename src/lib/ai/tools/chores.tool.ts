// src/lib/ai/tools/chores.tool.ts
// AI tool registrations for chore operations.
// Provides: completeChore, queryChores

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'
import { todayBoundsInTz, nDaysFromTodayInTz, formatInTz } from '@/lib/timezone'
import { calculateNextDueDate } from '@/lib/chore-helpers'

// ── Context provider ──────────────────────────────────────────────────────────

async function choresContextProvider(familyId: string, _userId: string, timezone: string): Promise<string> {
  const chores = await prisma.chore.findMany({
    where: { familyId, isActive: true },
    include: { currentAssignee: { select: { id: true, name: true } } },
    orderBy: { nextDueDate: 'asc' },
  })

  if (chores.length === 0) {
    return 'No active chores.'
  }

  const lines = chores.map(c => {
    const due = c.nextDueDate
      ? formatInTz(new Date(c.nextDueDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      : 'overdue/now'
    const assignee = c.currentAssignee?.name ?? 'unassigned'
    return `"${c.title}" (id: ${c.id}, due: ${due}, assigned: ${assignee})`
  })

  return `Active chores (use the id when calling completeChore):\n${lines.join('\n')}`
}

// ── completeChore ─────────────────────────────────────────────────────────────

const completeChoreDefinition: FunctionDeclaration = {
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
}

async function completeChoreHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { choreId, note } = args as { choreId: string; note?: string }

  const chore = await prisma.chore.findFirst({
    where: { id: choreId, familyId: ctx.familyId },
  })
  if (!chore) {
    return { message: 'Chore not found.' }
  }

  await prisma.choreCompletion.create({
    data: { choreId, completedById: ctx.user.id, note: note ?? null },
  })

  const completedAt = new Date()
  const timezone = ctx.timezone ?? 'UTC'
  const nextDueDate = calculateNextDueDate(chore, completedAt, timezone)

  if (nextDueDate === null) {
    await prisma.chore.update({ where: { id: choreId }, data: { isActive: false, nextDueDate: null } })
  } else {
    await prisma.chore.update({ where: { id: choreId }, data: { nextDueDate } })
  }

  const nextPart = nextDueDate
    ? ` Next due: ${formatInTz(nextDueDate, timezone, { weekday: 'long', day: 'numeric', month: 'short' })}.`
    : ' Chore completed for the last time.'
  return {
    message: `"${chore.title}" marked as done.${nextPart}`,
    action: 'completeChore',
  }
}

// ── queryChores ───────────────────────────────────────────────────────────────

const queryChoresDefinition: FunctionDeclaration = {
  name: 'queryChores',
  description: 'Look up chores that are due, overdue, or coming up. Use this when the user asks "what chores are due?", "what needs doing?", or "what are my chores this week?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filter: { type: SchemaType.STRING, description: 'Optional: "overdue" for past-due chores, "upcoming" for next 7 days, "mine" for chores assigned to the current user. Omit for all active chores.' },
    },
  },
}

async function queryChoresHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { filter } = args as { filter?: string }

  const chores = await prisma.chore.findMany({
    where: { familyId: ctx.familyId, isActive: true },
    include: { currentAssignee: { select: { id: true, name: true } } },
    orderBy: { nextDueDate: 'asc' },
  })

  const timezone = ctx.timezone ?? 'UTC'
  const { start: todayStart } = todayBoundsInTz(timezone)
  const nextWeek = nDaysFromTodayInTz(7, timezone)

  let filtered = chores
  if (filter === 'overdue') {
    filtered = chores.filter(c => c.nextDueDate && new Date(c.nextDueDate) < todayStart)
  } else if (filter === 'upcoming') {
    filtered = chores.filter(c => c.nextDueDate && new Date(c.nextDueDate) <= nextWeek)
  } else if (filter === 'mine') {
    filtered = chores.filter(c => (c as { currentAssigneeId?: string }).currentAssigneeId === ctx.user.id)
  }

  if (filtered.length === 0) {
    const label = filter === 'overdue' ? 'overdue chores' : filter === 'upcoming' ? 'upcoming chores' : filter === 'mine' ? 'chores assigned to you' : 'active chores'
    return { message: `No ${label} found.` }
  }

  const lines = filtered.map(c => {
    const due = c.nextDueDate
      ? formatInTz(new Date(c.nextDueDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      : 'overdue'
    const assignee = c.currentAssignee?.name ?? 'unassigned'
    return `• ${c.title} — due ${due}, assigned to ${assignee}`
  })
  return { message: lines.join('\n') }
}

// ── Register all chore tools ──────────────────────────────────────────────────

export function registerChoreTools(): void {
  registerTool('completeChore', {
    definition: completeChoreDefinition,
    contextProvider: choresContextProvider,
    handler: completeChoreHandler,
    actionEvents: { completeChore: 'app:choresUpdated' },
  })

  registerTool('queryChores', {
    definition: queryChoresDefinition,
    handler: queryChoresHandler,
  })
}
