// src/lib/ai/tools/documents.tool.ts
// AI tool registrations for document lookup operations.
// Provides: queryDocuments

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { todayBoundsInTz, nDaysFromTodayInTz, formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── queryDocuments ────────────────────────────────────────────────────────────

const queryDocumentsDefinition: FunctionDeclaration = {
  name: 'queryDocuments',
  description: 'Look up stored documents, particularly those expiring soon. Use this when the user asks "any documents expiring soon?", "when does our insurance expire?", or "find the X document".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'Optional: search term or category like "insurance", "passport", "warranty". Omit to show documents expiring within 90 days.' },
      expiringOnly: { type: SchemaType.BOOLEAN, description: 'Set to true to only show documents with upcoming expiry dates' },
    },
  },
}

async function queryDocumentsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { query, expiringOnly } = args as { query?: string; expiringOnly?: boolean }

  const documents = await prisma.document.findMany({
    where: { familyId: ctx.familyId },
    select: { title: true, category: true, expiryDate: true, notes: true, pinHash: true, fileName: true },
    orderBy: { expiryDate: 'asc' },
  })

  if (documents.length === 0) {
    return { message: 'No documents stored.' }
  }

  const timezone = ctx.timezone ?? 'UTC'
  const { start: today } = todayBoundsInTz(timezone)
  const ninetyDays = nDaysFromTodayInTz(90, timezone)

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
    return { message: query ? `No documents found matching "${query}".` : 'No documents expiring in the next 90 days.' }
  }

  const lines = filtered.map(d => {
    if (d.pinHash) {
      return `• ${d.title} (${d.category}) — PIN protected`
    }
    const expiry = d.expiryDate
      ? (() => {
          const exp = new Date(d.expiryDate)
          const daysLeft = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          const expStr = formatInTz(exp, timezone, { day: 'numeric', month: 'long', year: 'numeric' })
          if (daysLeft < 0) return `expired ${Math.abs(daysLeft)} days ago (${expStr})`
          if (daysLeft === 0) return `expires TODAY (${expStr})`
          return `expires ${expStr} (${daysLeft} days)`
        })()
      : 'no expiry date'
    const notePart = d.notes ? ` — ${d.notes}` : ''
    return `• ${d.title} (${d.category}) — ${expiry}${notePart}`
  })

  return { message: lines.join('\n') }
}

// ── Register all document tools ───────────────────────────────────────────────

export function registerDocumentTools(): void {
  registerTool('queryDocuments', {
    definition: queryDocumentsDefinition,
    handler: queryDocumentsHandler,
  })
}
