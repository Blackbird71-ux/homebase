// src/lib/ai/tools/contacts.tool.ts
// AI tool registrations for contact lookup operations.
// Provides: lookupContact

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── lookupContact ─────────────────────────────────────────────────────────────

const lookupContactDefinition: FunctionDeclaration = {
  name: 'lookupContact',
  description: "Look up a household contact by name or category. Use this when the user asks \"what's the dentist's number?\", \"find the plumber's details\", or \"what's the school's phone number?\".",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'The name or category to search for (e.g. "dentist", "school", "plumber")' },
    },
    required: ['query'],
  },
}

async function lookupContactHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { query } = args as { query: string }
  const lower = query.toLowerCase()

  const contacts = await prisma.householdContact.findMany({
    where: { familyId: ctx.familyId },
    select: { name: true, category: true, phone: true, email: true, address: true, notes: true, pinHash: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  const matches = contacts.filter(c =>
    c.name.toLowerCase().includes(lower) || c.category.toLowerCase().includes(lower)
  )

  if (matches.length === 0) {
    return { message: `No contacts found matching "${query}".` }
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

  return { message: lines.join('\n') }
}

// ── Register all contact tools ────────────────────────────────────────────────

export function registerContactTools(): void {
  registerTool('lookupContact', {
    definition: lookupContactDefinition,
    handler: lookupContactHandler,
  })
}
