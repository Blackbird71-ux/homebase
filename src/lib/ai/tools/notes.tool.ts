// src/lib/ai/tools/notes.tool.ts
// AI tool registrations for notes operations.
// Provides: createNote, queryNotes

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── createNote ────────────────────────────────────────────────────────────────

const createNoteDefinition: FunctionDeclaration = {
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
}

async function createNoteHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { title, content } = args as { title: string; content?: string }

  const note = await prisma.note.create({
    data: {
      title,
      content: content || '',
      createdBy: ctx.user.id,
      familyId: ctx.familyId,
    },
  })

  return {
    message: `Note "${title}" created.`,
    action: 'createNote',
    noteId: note.id,
  }
}

// ── queryNotes ────────────────────────────────────────────────────────────────

const queryNotesDefinition: FunctionDeclaration = {
  name: 'queryNotes',
  description: 'Search notes by keyword. Use this when the user asks "do I have any notes about X?", "find my note on Y", or "what did I write about Z?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'The keyword or phrase to search for in note titles and content' },
    },
    required: ['query'],
  },
}

async function queryNotesHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { query } = args as { query: string }
  const lower = query.toLowerCase()

  const notes = await prisma.note.findMany({
    where: {
      familyId: ctx.familyId,
      OR: [
        { title: { contains: query } },
        { content: { contains: query } },
      ],
    },
    select: { id: true, title: true, content: true, createdAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  // SQLite contains is case-sensitive; do a secondary client-side filter
  const matched = notes.filter(n =>
    n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
  )

  if (matched.length === 0) {
    return { message: `No notes found matching "${query}".` }
  }

  const lines = matched.map(n => {
    const snippet = n.content.length > 80 ? n.content.slice(0, 80).trimEnd() + '…' : n.content
    return `• ${n.title}${snippet ? `: ${snippet}` : ''}`
  })
  return { message: `Found ${matched.length} note${matched.length > 1 ? 's' : ''} matching "${query}":\n${lines.join('\n')}` }
}

// ── Register all note tools ───────────────────────────────────────────────────

export function registerNoteTools(): void {
  registerTool('createNote', {
    definition: createNoteDefinition,
    handler: createNoteHandler,
    actionEvents: { createNote: 'app:notesUpdated' },
  })

  registerTool('queryNotes', {
    definition: queryNotesDefinition,
    handler: queryNotesHandler,
  })
}
