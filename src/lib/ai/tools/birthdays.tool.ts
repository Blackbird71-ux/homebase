// src/lib/ai/tools/birthdays.tool.ts
// AI tool registrations for birthday/anniversary lookup operations.
// Provides: queryBirthdays

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz, todayStringInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function birthdaysContextProvider(familyId: string, _userId: string, _timezone: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { familyId },
    select: { family: { select: { birthdays: true } } },
  })

  const birthdayRaw = user?.family?.birthdays ?? null
  const birthdayList: Array<{ name: string; type: string; date: string }> = birthdayRaw
    ? (() => { try { return JSON.parse(birthdayRaw) } catch { return [] } })()
    : []

  if (birthdayList.length === 0) {
    return 'Stored birthdays/anniversaries: none stored'
  }

  const summary = birthdayList.map(b => `${b.name} (${b.type}): ${b.date}`).join(', ')
  return `Stored birthdays/anniversaries: ${summary}`
}

// ── queryBirthdays ────────────────────────────────────────────────────────────

const queryBirthdaysDefinition: FunctionDeclaration = {
  name: 'queryBirthdays',
  description: 'Check upcoming birthdays or anniversaries. Use this when the user asks "any birthdays coming up?", "whose birthday is this month?", or "when is X\'s birthday?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'Optional: a name or month to filter by, e.g. "May" or "Sarah". Omit to see all upcoming birthdays in the next 60 days.' },
    },
  },
}

async function queryBirthdaysHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { query } = args as { query?: string }

  const user = await prisma.user.findFirst({
    where: { familyId: ctx.familyId },
    select: { family: { select: { birthdays: true } } },
  })

  const birthdayRaw = user?.family?.birthdays ?? null
  const birthdayList: Array<{ name: string; type: string; date: string }> = birthdayRaw
    ? (() => { try { return JSON.parse(birthdayRaw) } catch { return [] } })()
    : []

  if (birthdayList.length === 0) {
    return { message: 'No birthdays or anniversaries stored. Add them in Settings → Family.' }
  }

  const timezone = ctx.timezone ?? 'UTC'
  const nowStr = todayStringInTz(timezone)
  // UTC midnight of the user's local calendar date. All date math below stays
  // in UTC date-keys so it never depends on the server's OS timezone.
  const today = new Date(nowStr)
  const currentYear = today.getUTCFullYear()

  // Enrich with next occurrence and days until
  const enriched = birthdayList
    .map(b => {
      const parts = b.date.split('-')
      const month = parseInt(parts[parts.length - 2]) - 1 // 0-indexed
      const day = parseInt(parts[parts.length - 1])
      let next = new Date(Date.UTC(currentYear, month, day))
      if (next < today) next = new Date(Date.UTC(currentYear + 1, month, day))
      const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...b, next, daysUntil }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  let filtered = enriched
  if (query) {
    const lower = query.toLowerCase()
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const monthIdx = monthNames.findIndex(m => m.startsWith(lower))
    if (monthIdx >= 0) {
      filtered = enriched.filter(b => b.next.getUTCMonth() === monthIdx)
    } else {
      filtered = enriched.filter(b => b.name.toLowerCase().includes(lower))
    }
  } else {
    // Default: next 60 days
    filtered = enriched.filter(b => b.daysUntil <= 60)
  }

  if (filtered.length === 0) {
    return { message: query ? `No birthdays found matching "${query}".` : 'No birthdays in the next 60 days.' }
  }

  const lines = filtered.map(b => {
    // b.next is a UTC-midnight date-key — format in UTC to read it back as-is
    const dateStr = formatInTz(b.next, 'UTC', { day: 'numeric', month: 'long' })
    const countdown = b.daysUntil === 0 ? ' — TODAY!' : b.daysUntil === 1 ? ' — tomorrow!' : ` — in ${b.daysUntil} days`
    return `• ${b.name} (${b.type}) — ${dateStr}${countdown}`
  })

  return { message: lines.join('\n') }
}

// ── Register all birthday tools ───────────────────────────────────────────────

export function registerBirthdayTools(): void {
  registerTool('queryBirthdays', {
    definition: queryBirthdaysDefinition,
    contextProvider: birthdaysContextProvider,
    handler: queryBirthdaysHandler,
  })
}
