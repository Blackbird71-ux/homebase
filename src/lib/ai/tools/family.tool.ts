// src/lib/ai/tools/family.tool.ts
// AI tool registrations for family coordination — member listings, chore assignments, shared events.
// Provides: queryFamilyMembers, queryFamilyOverview

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function familyContextProvider(familyId: string, _userId: string): Promise<string> {
  const members = await prisma.user.findMany({
    where: { familyId },
    select: { name: true, role: true },
    orderBy: { name: 'asc' },
  })

  if (members.length === 0) return ''

  const lines = members.map(m => `  • ${m.name}${m.role === 'admin' ? ' (admin)' : ''}`)
  return `Family members:\n${lines.join('\n')}`
}

// ── queryFamilyMembers ────────────────────────────────────────────────────────

const queryFamilyMembersDefinition: FunctionDeclaration = {
  name: 'queryFamilyMembers',
  description: 'List family members and their roles. Use when the user asks "who is in our family?", "list family members", or "who has access to HomeBase?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
}

async function queryFamilyMembersHandler(_args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const members = await prisma.user.findMany({
    where: { familyId: ctx.familyId },
    select: { name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  if (members.length === 0) {
    return { message: 'No family members found.' }
  }

  const lines = members.map(m =>
    `  • ${m.name} (${m.email}) — ${m.role}`
  )

  return { message: `**Family Members (${members.length})**\n${lines.join('\n')}` }
}

// ── queryFamilyOverview ───────────────────────────────────────────────────────

const queryFamilyOverviewDefinition: FunctionDeclaration = {
  name: 'queryFamilyOverview',
  description: 'Get a quick overview of family activity — who has chores assigned, upcoming events, and recent activity. Use when the user asks "what\'s everyone up to?", "family status", or "give me a family overview".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
}

async function queryFamilyOverviewHandler(_args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const now = new Date()
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Family members
  const members = await prisma.user.findMany({
    where: { familyId: ctx.familyId },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  if (members.length === 0) {
    return { message: 'No family members found.' }
  }

  const memberIds = members.map(m => m.id)

  // Chore assignments per person
  const choreAssignments = await prisma.chore.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      currentAssigneeId: { not: null },
    },
    select: {
      title: true,
      nextDueDate: true,
      currentAssigneeId: true,
      currentAssignee: { select: { name: true } },
    },
    orderBy: { nextDueDate: 'asc' },
    take: 20,
  })

  // Events this week
  const weekEvents = await prisma.event.findMany({
    where: {
      familyId: ctx.familyId,
      start: { gte: now, lte: weekEnd },
    },
    select: { title: true, start: true, isAllDay: true },
    orderBy: { start: 'asc' },
  })

  // Build per-member overview
  const memberSections = members.map(m => {
    const assignedChores = choreAssignments
      .filter(c => c.currentAssigneeId === m.id)
      .map(c => {
        const dateLabel = c.nextDueDate
          ? new Date(c.nextDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
          : 'due now'
        return `    • ${c.title} — ${dateLabel}`
      })

    const parts = [`  **${m.name}**${m.role === 'admin' ? ' (admin)' : ''}`]
    if (assignedChores.length > 0) {
      parts.push(`  Chores (${assignedChores.length}):\n${assignedChores.join('\n')}`)
    } else {
      parts.push('  No assigned chores.')
    }
    return parts.join('\n')
  })

  // Events section
  let eventsSection = '**📆 This Week\'s Events**\n'
  if (weekEvents.length > 0) {
    const lines = weekEvents.map(e => {
      const dateLabel = new Date(e.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      const timeLabel = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
      return `  • ${e.title} — ${dateLabel} ${timeLabel}`
    })
    eventsSection += lines.join('\n')
  } else {
    eventsSection += '  No events this week.'
  }

  return {
    message: `**👨‍👩‍👧‍👦 Family Overview (${members.length} members)**\n\n${memberSections.join('\n\n')}\n\n${eventsSection}`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerFamilyTools(): void {
  registerTool('queryFamilyMembers', {
    definition: queryFamilyMembersDefinition,
    contextProvider: familyContextProvider,
    handler: queryFamilyMembersHandler,
  })

  registerTool('queryFamilyOverview', {
    definition: queryFamilyOverviewDefinition,
    handler: queryFamilyOverviewHandler,
  })
}
