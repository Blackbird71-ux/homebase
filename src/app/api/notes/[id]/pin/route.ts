import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

async function _PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { isPinned } = body

  if (typeof isPinned !== 'boolean') {
    return NextResponse.json(
      { error: 'isPinned (boolean) is required' },
      { status: 400 }
    )
  }

  // Check if note exists and belongs to user's family
  const existingNote = await prisma.note.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!existingNote) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    )
  }

  // Never let one user pin another user's private note
  if (existingNote.isPrivate && existingNote.createdBy !== user.id) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    )
  }

  const note = await prisma.note.update({
    where: { id },
    data: { isPinned },
  })

  void createAuditLog(
    user,
    'update',
    'note',
    id,
    `${isPinned ? 'Pinned' : 'Unpinned'} note "${existingNote.title}"`,
    { note: { title: existingNote.title, isPinned } }
  )

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isArchived: note.isArchived,
    isPinned: note.isPinned,
    isSecured: !!note.pinHash,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  })
}

export const PATCH = withRouteErrors(_PATCH)
