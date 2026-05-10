// src/lib/ai/tools/calendar.tool.ts
// AI tool registrations for calendar event operations.
// Provides: createCalendarEvent, queryEvents

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { resolveDayToDate } from '@/lib/ai/orchestrator'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function calendarContextProvider(familyId: string, _userId: string): Promise<string> {
  const timezone = 'UTC'
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { format, addDays, parseISO } = require('date-fns')
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  const weekEvents = await prisma.event.findMany({
    where: {
      familyId,
      start: {
        gte: new Date(nowStr + 'T00:00:00Z'),
        lte: new Date(weekEndStr + 'T23:59:59Z'),
      },
    },
    select: { id: true, title: true, start: true, end: true, isAllDay: true, description: true },
    orderBy: { start: 'asc' },
  })

  if (weekEvents.length === 0) {
    return 'No events this week.'
  }

  const lines = weekEvents.map(e => {
    const dateLabel = new Date(e.start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: timezone })
    const timeLabel = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
    return `"${e.title}" — ${dateLabel} ${timeLabel}`
  })

  return `This week's calendar events:\n${lines.join('\n')}`
}

// ── createCalendarEvent ───────────────────────────────────────────────────────

const createEventDefinition: FunctionDeclaration = {
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
}

async function createEventHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = 'UTC'
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
      createdBy: ctx.user.id,
      familyId: ctx.familyId,
    },
  })

  const dayLabel = start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const timePart = allDay ? '' : ` at ${start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}`
  return {
    message: `Event "${title}" created for ${dayLabel}${timePart}.`,
    action: 'createCalendarEvent',
  }
}

// ── queryEvents ───────────────────────────────────────────────────────────────

const queryEventsDefinition: FunctionDeclaration = {
  name: 'queryEvents',
  description: "Look up calendar events for the current week or a specific day. Use this when the user asks \"what's on this week?\", \"do I have anything on Tuesday?\", or \"what's happening today?\".",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      day: { type: SchemaType.STRING, description: 'Optional: day name like "Monday" or "today". Omit to get the full week.' },
    },
  },
}

async function queryEventsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = 'UTC'
  const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { format, addDays, parseISO } = require('date-fns')
  const weekEndStr = format(addDays(parseISO(nowStr), 6), 'yyyy-MM-dd')

  const weekEvents = await prisma.event.findMany({
    where: {
      familyId: ctx.familyId,
      start: {
        gte: new Date(nowStr + 'T00:00:00Z'),
        lte: new Date(weekEndStr + 'T23:59:59Z'),
      },
    },
    select: { id: true, title: true, start: true, end: true, isAllDay: true, description: true },
    orderBy: { start: 'asc' },
  })

  const { day } = args as { day?: string }
  if (day) {
    const targetDate = resolveDayToDate(day, timezone)
    const dayEvents = weekEvents.filter(e => {
      const eventDate = new Date(e.start).toLocaleDateString('en-CA', { timeZone: timezone })
      return eventDate === targetDate
    })
    const dayLabel = new Date(targetDate + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    if (dayEvents.length === 0) {
      return { message: `Nothing in the calendar for ${dayLabel}.` }
    }
    const lines = dayEvents.map(e => {
      const timePart = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
      return `• ${e.title} (${timePart})`
    })
    return { message: `${dayLabel}:\n${lines.join('\n')}` }
  }

  if (weekEvents.length === 0) {
    return { message: 'No events in the calendar this week.' }
  }

  const lines = weekEvents.map(e => {
    const dateLabel = new Date(e.start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: timezone })
    const timePart = e.isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
    return `• ${e.title} — ${dateLabel} ${timePart}`
  })
  return { message: `This week's events:\n${lines.join('\n')}` }
}

// ── Register all calendar tools ───────────────────────────────────────────────

export function registerCalendarTools(): void {
  registerTool('createCalendarEvent', {
    definition: createEventDefinition,
    contextProvider: calendarContextProvider,
    handler: createEventHandler,
    actionEvents: { createCalendarEvent: 'app:calendarUpdated' },
  })

  registerTool('queryEvents', {
    definition: queryEventsDefinition,
    handler: queryEventsHandler,
  })
}
