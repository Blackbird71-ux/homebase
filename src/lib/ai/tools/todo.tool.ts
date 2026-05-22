// src/lib/ai/tools/todo.tool.ts
// AI tool registrations for to-do list operations.
// Provides: addTodoItem

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function todoContextProvider(familyId: string, _userId: string): Promise<string> {
  const lists = await prisma.list.findMany({
    where: { familyId, isActive: true, type: 'TODO' },
    select: { id: true, name: true },
    take: 3,
  })
  const summary = lists.length > 0
    ? lists.map(l => `"${l.name}" (id: ${l.id})`).join(', ')
    : 'none'
  return `Active to-do lists: ${summary}`
}

// ── addTodoItem ───────────────────────────────────────────────────────────────

const addTodoDefinition: FunctionDeclaration = {
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
}

async function addTodoHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { content, dueDate } = args as { content: string; dueDate?: string }

  const lists = await prisma.list.findMany({
    where: { familyId: ctx.familyId, isActive: true, type: 'TODO' },
    select: { id: true, name: true },
    take: 1,
  })

  let list = lists[0]
  if (!list) {
    const created = await prisma.list.create({
      data: { name: 'To Do', type: 'TODO', familyId: ctx.familyId },
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
      createdBy: ctx.user.id,
      sortOrder: nextOrder,
      dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
    },
  })

  const duePart = dueDate
    ? ` (due ${formatInTz(new Date(dueDate + 'T12:00:00Z'), ctx.timezone ?? 'UTC', { weekday: 'long', day: 'numeric', month: 'short' })})`
    : ''
  return {
    message: `Task added to ${list.name}: ${content}${duePart}.`,
    action: 'addTodoItem',
  }
}

// ── Register all todo tools ───────────────────────────────────────────────────

export function registerTodoTools(): void {
  registerTool('addTodoItem', {
    definition: addTodoDefinition,
    contextProvider: todoContextProvider,
    handler: addTodoHandler,
    actionEvents: { addTodoItem: 'app:todoListUpdated' },
  })
}
