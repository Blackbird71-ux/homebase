// src/lib/ai/tools/trips.tool.ts
// AI tool registrations for trip planning.
// Provides: queryTrips, createTrip

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

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
    const start = formatDate(t.startDate)
    const end = formatDate(t.endDate)
    const duration = daysBetween(t.startDate, t.endDate)
    const packingStatus = t.packingList
      ? t.packingList.items.length > 0
        ? ` (${t.packingList.items.length} item(s) left to pack)`
        : ' (all packed!)'
      : ''
    return `• **${t.title}** — ${t.destination}\n  ${start} → ${end} (${duration} day(s))\n  Status: ${t.status}${packingStatus}`
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
    },
    required: ['title', 'destination', 'startDate', 'endDate'],
  },
}

async function createTripHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { title, destination, startDate, endDate, accommodation, transport, notes } = args as {
    title: string
    destination: string
    startDate: string
    endDate: string
    accommodation?: string
    transport?: string
    notes?: string
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
      createdBy: ctx.user.id,
      familyId: ctx.familyId,
    },
  })

  return {
    message: `✅ Trip created!\n\n**${trip.title}** — ${trip.destination}\n${formatDate(trip.startDate)} → ${formatDate(trip.endDate)}`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerTripTools(): void {
  registerTool(queryTripsDefinition, queryTripsHandler)
  registerTool(createTripDefinition, createTripHandler)
}
