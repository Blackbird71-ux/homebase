// src/lib/ai/tools/trips.tool.ts
// AI tool registrations for trip planning.
// Provides: queryTrips, createTrip, queryItinerary, updateTripItinerary

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ── queryTrips ─────────────────────────────────────────────────────────────────

const queryTripsDefinition: FunctionDeclaration = {
  name: 'queryTrips',
  description: 'Query upcoming, active, or past trips for the family. Use this when the user asks "what trips are coming up?", "show me our trips", "what trips do we have planned?", or "when is our next trip?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      status: {
        type: SchemaType.STRING,
        format: 'enum',
        description: 'Optional filter: "upcoming" (future trips), "active" (currently happening), "past" (completed/cancelled), or omit for all.',
        enum: ['upcoming', 'active', 'past', 'all'],
      },
    },
  },
}

async function queryTripsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { status } = args as { status?: string }
  const timezone = ctx.timezone ?? 'UTC'
  const now = new Date()

  let where: Record<string, unknown> = { familyId: ctx.familyId }

  if (status === 'upcoming') {
    where = {
      ...where,
      startDate: { gt: now },
      status: { notIn: ['cancelled', 'completed'] },
    }
  } else if (status === 'active') {
    where = {
      ...where,
      startDate: { lte: now },
      endDate: { gte: now },
      status: { notIn: ['cancelled', 'completed'] },
    }
  } else if (status === 'past') {
    where = {
      ...where,
      OR: [
        { status: 'completed' },
        { status: 'cancelled' },
        { endDate: { lt: now } },
      ],
    }
  }

  const trips = await prisma.trip.findMany({
    where: where as any,
    orderBy: { startDate: 'asc' },
    include: {
      packingList: {
        select: {
          id: true,
          name: true,
          items: {
            where: { isCompleted: false },
            select: { id: true },
          },
        },
      },
    },
  })

  if (trips.length === 0) {
    return { message: status ? `No ${status} trips found.` : 'No trips found.' }
  }

  const lines = trips.map((t) => {
    const start = formatInTz(t.startDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    const end = formatInTz(t.endDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    const duration = daysBetween(t.startDate, t.endDate)
    const packingStatus = t.packingList
      ? t.packingList.items.length > 0
        ? ` (${t.packingList.items.length} item(s) left to pack)`
        : ' (all packed!)'
      : ''
    return `\u2022 **${t.title}** \u2014 ${t.destination}\n  ${start} \u2192 ${end} (${duration} day(s))\n  Status: ${t.status}${packingStatus}`
  })

  const summary = `Found ${trips.length} trip(s):\n\n${lines.join('\n\n')}`
  return { message: summary }
}

// ── createTrip ─────────────────────────────────────────────────────────────────

const createTripDefinition: FunctionDeclaration = {
  name: 'createTrip',
  description: 'Create a new family trip. Use this when the user says "plan a trip to ...", "create a trip", or "add a new trip".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: { type: SchemaType.STRING, description: 'Trip title, e.g. "Japan 2027"' },
      destination: { type: SchemaType.STRING, description: 'Destination, e.g. "Tokyo, Japan"' },
      startDate: { type: SchemaType.STRING, description: 'Start date in YYYY-MM-DD format' },
      endDate: { type: SchemaType.STRING, description: 'End date in YYYY-MM-DD format' },
      accommodation: { type: SchemaType.STRING, description: 'Optional accommodation details' },
      transport: { type: SchemaType.STRING, description: 'Optional transport details' },
      notes: { type: SchemaType.STRING, description: 'Optional notes about the trip' },
      estimatedBudget: { type: SchemaType.NUMBER, description: 'Optional estimated total budget for the trip' },
      budgetBreakdown: { type: SchemaType.STRING, description: 'Optional JSON string of budget breakdown, e.g. {"flights":2000,"hotel":1500,"food":800,"activities":500,"transport":400,"other":300}' },
    },
    required: ['title', 'destination', 'startDate', 'endDate'],
  },
}

async function createTripHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = ctx.timezone ?? 'UTC'
  const { title, destination, startDate, endDate, accommodation, transport, notes, estimatedBudget, budgetBreakdown } = args as {
    title: string
    destination: string
    startDate: string
    endDate: string
    accommodation?: string
    transport?: string
    notes?: string
    estimatedBudget?: number
    budgetBreakdown?: string
  }

  const trip = await prisma.trip.create({
    data: {
      title,
      destination,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      accommodation: accommodation ?? null,
      transport: transport ?? null,
      notes: notes ?? null,
      estimatedBudget: estimatedBudget ?? null,
      budgetBreakdown: budgetBreakdown ?? null,
      createdBy: ctx.user.id,
      familyId: ctx.familyId,
    },
  })

  const budgetLine = estimatedBudget
    ? `\n\U0001f4b0 Estimated budget: $${estimatedBudget.toLocaleString('en-AU')}`
    : ''

  return {
    message: `\u2705 Trip created!\n\n**${trip.title}** \u2014 ${trip.destination}\n${formatInTz(trip.startDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} \u2192 ${formatInTz(trip.endDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${budgetLine}`,
  }
}

// ── queryItinerary ─────────────────────────────────────────────────────────────

const queryItineraryDefinition: FunctionDeclaration = {
  name: 'queryItinerary',
  description: 'Query the day-by-day itinerary for a specific trip. Use this when the user says "what\'s our itinerary for ...", "show me the trip plan for ...", "what are we doing on our trip?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tripId: { type: SchemaType.STRING, description: 'The trip ID to query itinerary for' },
    },
    required: ['tripId'],
  },
}

async function queryItineraryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { tripId } = args as { tripId: string }
  const timezone = ctx.timezone ?? 'UTC'

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, familyId: ctx.familyId },
    select: { id: true, title: true, destination: true, startDate: true, endDate: true },
  })

  if (!trip) {
    return { message: 'Trip not found.' }
  }

  const days = await prisma.tripDay.findMany({
    where: { tripId },
    orderBy: { sortOrder: 'asc' },
    include: {
      activities: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (days.length === 0) {
    return {
      message: `**${trip.title}** \u2014 ${trip.destination}\n${formatInTz(trip.startDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} \u2192 ${formatInTz(trip.endDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}\n\nNo itinerary days have been added yet.`,
    }
  }

  const dayLines = days.map((day) => {
    const dateStr = formatInTz(day.date, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    const labelStr = day.label ? ` \u2014 *${day.label}*` : ''
    const notesStr = day.notes ? `\n  \U0001f4dd ${day.notes}` : ''
    const activityLines = day.activities.map((a) => {
      const timeStr = a.startTime
        ? ` ${formatInTz(new Date(a.startTime), timezone, { hour: 'numeric', minute: '2-digit' })}${a.endTime ? `\u2013${formatInTz(new Date(a.endTime), timezone, { hour: 'numeric', minute: '2-digit' })}` : ''}`
        : ''
      const catStr = a.category ? ` [${a.category}]` : ''
      const locStr = a.location ? ` @ ${a.location}` : ''
      const noteStr = a.notes ? ` \u2014 ${a.notes}` : ''
      return `  \u2022${timeStr} **${a.title}**${catStr}${locStr}${noteStr}`
    })
    return `\U0001f4c5 **Day ${day.sortOrder + 1}**${labelStr} \u2014 ${dateStr}${notesStr}\n${activityLines.join('\n')}`
  })

  return {
    message: `**${trip.title}** \u2014 ${trip.destination}\n${formatInTz(trip.startDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} \u2192 ${formatInTz(trip.endDate, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}\n\n${dayLines.join('\n\n')}`,
  }
}

// ── updateTripItinerary ────────────────────────────────────────────────────────

const updateTripItineraryDefinition: FunctionDeclaration = {
  name: 'updateTripItinerary',
  description: 'Add or update a day or activity in a trip itinerary. Use this when the user says "add a day to ...", "add an activity on day 2", "update the itinerary for ...".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tripId: { type: SchemaType.STRING, description: 'The trip ID' },
      action: {
        type: SchemaType.STRING,
        format: 'enum',
        description: 'Action to perform: "addDay", "deleteDay", "addActivity", "deleteActivity"',
        enum: ['addDay', 'deleteDay', 'addActivity', 'deleteActivity'],
      },
      dayDate: { type: SchemaType.STRING, description: 'Date for the day in YYYY-MM-DD format (for addDay action, or to identify the day for activity actions)' },
      dayLabel: { type: SchemaType.STRING, description: 'Optional label for the day (e.g. "Travel Day", "Beach Day")' },
      dayNotes: { type: SchemaType.STRING, description: 'Optional notes for the day' },
      dayId: { type: SchemaType.STRING, description: 'Day ID (required for deleteDay, or to identify which day to add activity to)' },
      activityTitle: { type: SchemaType.STRING, description: 'Title of the activity (required for addActivity)' },
      activityCategory: { type: SchemaType.STRING, description: 'Optional category: sightseeing, meal, transport, accommodation, activity' },
      activityLocation: { type: SchemaType.STRING, description: 'Optional location for the activity' },
      activityStartTime: { type: SchemaType.STRING, description: 'Optional start time in HH:MM format' },
      activityEndTime: { type: SchemaType.STRING, description: 'Optional end time in HH:MM format' },
      activityNotes: { type: SchemaType.STRING, description: 'Optional notes for the activity' },
      activityId: { type: SchemaType.STRING, description: 'Activity ID (required for deleteActivity)' },
    },
    required: ['tripId', 'action'],
  },
}

async function updateTripItineraryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const {
    tripId,
    action,
    dayDate,
    dayLabel,
    dayNotes,
    dayId,
    activityTitle,
    activityCategory,
    activityLocation,
    activityStartTime,
    activityEndTime,
    activityNotes,
    activityId,
  } = args as {
    tripId: string
    action: string
    dayDate?: string
    dayLabel?: string
    dayNotes?: string
    dayId?: string
    activityTitle?: string
    activityCategory?: string
    activityLocation?: string
    activityStartTime?: string
    activityEndTime?: string
    activityNotes?: string
    activityId?: string
  }

  // Verify trip belongs to user's family
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, familyId: ctx.familyId },
    select: { id: true },
  })

  if (!trip) {
    return { message: 'Trip not found.' }
  }

  try {
    switch (action) {
      case 'addDay': {
        if (!dayDate) return { message: 'dayDate is required to add a day.' }
        const dateObj = new Date(dayDate)
        // Check for existing day on this date
        const existing = await prisma.tripDay.findUnique({
          where: { tripId_date: { tripId, date: dateObj } },
        })
        if (existing) {
          return { message: `A day already exists for ${dayDate}. Use the day ID "${existing.id}" to add activities to it.` }
        }
        // Count existing days for sortOrder
        const dayCount = await prisma.tripDay.count({ where: { tripId } })
        await prisma.tripDay.create({
          data: {
            tripId,
            date: dateObj,
            label: dayLabel ?? null,
            notes: dayNotes ?? null,
            sortOrder: dayCount,
          },
        })
        return { message: `\u2705 Day added for ${dayDate}${dayLabel ? ` (${dayLabel})` : ''}.` }
      }

      case 'deleteDay': {
        if (!dayId) return { message: 'dayId is required to delete a day.' }
        await prisma.tripDay.delete({ where: { id: dayId } })
        return { message: '\u2705 Day deleted.' }
      }

      case 'addActivity': {
        if (!dayId) return { message: 'dayId is required to add an activity.' }
        if (!activityTitle) return { message: 'activityTitle is required to add an activity.' }

        // Count existing activities for sortOrder
        const activityCount = await prisma.tripActivity.count({ where: { dayId } })

        let startTime: Date | undefined
        let endTime: Date | undefined
        if (activityStartTime) {
          const [h, m] = activityStartTime.split(':').map(Number)
          const day = await prisma.tripDay.findUnique({ where: { id: dayId }, select: { date: true } })
          if (day) {
            startTime = new Date(day.date)
            startTime.setUTCHours(h, m, 0, 0)
          }
        }
        if (activityEndTime) {
          const [h, m] = activityEndTime.split(':').map(Number)
          const day = await prisma.tripDay.findUnique({ where: { id: dayId }, select: { date: true } })
          if (day) {
            endTime = new Date(day.date)
            endTime.setUTCHours(h, m, 0, 0)
          }
        }

        await prisma.tripActivity.create({
          data: {
            dayId,
            title: activityTitle,
            category: activityCategory ?? null,
            location: activityLocation ?? null,
            startTime: startTime ?? null,
            endTime: endTime ?? null,
            notes: activityNotes ?? null,
            sortOrder: activityCount,
          },
        })

        return { message: `\u2705 Activity "${activityTitle}" added to the itinerary.` }
      }

      case 'deleteActivity': {
        if (!activityId) return { message: 'activityId is required to delete an activity.' }
        await prisma.tripActivity.delete({ where: { id: activityId } })
        return { message: '\u2705 Activity deleted.' }
      }

      default:
        return { message: `Unknown action: "${action}". Supported actions: addDay, deleteDay, addActivity, deleteActivity.` }
    }
  } catch (err) {
    return { message: `\u274c Error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerTripTools(): void {
  registerTool('queryTrips', {
    definition: queryTripsDefinition,
    handler: queryTripsHandler,
  })

  registerTool('createTrip', {
    definition: createTripDefinition,
    handler: createTripHandler,
  })

  registerTool('queryItinerary', {
    definition: queryItineraryDefinition,
    handler: queryItineraryHandler,
  })

  registerTool('updateTripItinerary', {
    definition: updateTripItineraryDefinition,
    handler: updateTripItineraryHandler,
  })
}
