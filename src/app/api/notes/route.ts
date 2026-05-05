import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { hashPin } from '@/lib/secure-unlock'

function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try {
    return JSON.parse(tags) as string[]
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')

  const notes = await prisma.note.findMany({
    where: {
      familyId: user.familyId,
      // Never return other users' private notes
      OR: [
        { isPrivate: false },
        { isPrivate: true, createdBy: user.id },
      ],
      ...(search && {
        AND: [{
          OR: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        }],
      }),
      ...(category && { category }),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      isPrivate: true,
      pinHash: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Filter by tag if specified (tags are stored as JSON array)
  let filteredNotes = notes
  if (tag) {
    filteredNotes = notes.filter(note => {
      if (!note.tags) return false
      try {
        const tagsArray = JSON.parse(note.tags) as string[]
        return tagsArray.includes(tag)
      } catch {
        return false
      }
    })
  }

  return NextResponse.json(
    filteredNotes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      isPrivate: note.isPrivate,
      isSecured: !!note.pinHash,
      tags: parseTags(note.tags),
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, content, category, tags, isPrivate, pin } = body

  if (!title) {
    return NextResponse.json(
      { error: 'title is required' },
      { status: 400 }
    )
  }

  // Hash PIN if provided
  let pinHash: string | undefined
  if (pin && typeof pin === 'string' && pin.length >= 4) {
    pinHash = await hashPin(pin)
  }

  const note = await prisma.note.create({
    data: {
      title,
      content: content || '',
      category: category || null,
      tags: tags ? JSON.stringify(tags) : null,
      isPrivate: isPrivate ?? false,
      pinHash: pinHash ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  void createAuditLog(
    user,
    'create',
    'note',
    note.id,
    `Created note "${title}"${pinHash ? ' (PIN protected)' : ''}`,
    { note: { title, category } }
  )

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isSecured: !!(note as any).pinHash,
    tags: parseTags(note.tags),
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }, { status: 201 })
}
