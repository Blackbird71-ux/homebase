import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const note = await prisma.note.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
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

  if (!note) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    )
  }

  // Block access to other users' private notes
  if (note.isPrivate && note.createdBy !== user.id) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Check if note is PIN-protected and needs unlocking
  let isLocked = false
  if (note.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('note', id)
    const unlockCookie = cookieStore.get(cookieName)
    isLocked = !(unlockCookie?.value && isUnlockTokenValid(unlockCookie.value))
  }

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: isLocked ? '' : note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isSecured: !!note.pinHash,
    isLocked,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, content, category, tags, isPrivate } = body

  if (!title || !content) {
    return NextResponse.json(
      { error: 'title and content are required' },
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

  const note = await prisma.note.update({
    where: { id },
    data: {
      title,
      content,
      category: category || null,
      tags: tags ? JSON.stringify(tags) : null,
      isPrivate: isPrivate ?? existingNote.isPrivate,
      updatedAt: new Date(),
    },
  })

  void createAuditLog(
    user,
    'update',
    'note',
    id,
    `Updated note "${title}"`,
    { before: { title: existingNote.title } }
  )

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

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

  await prisma.note.delete({
    where: { id },
  })

  void createAuditLog(
    user,
    'delete',
    'note',
    id,
    `Deleted note "${existingNote.title}"`,
    { note: { title: existingNote.title, category: existingNote.category } }
  )

  return NextResponse.json({ success: true })
}
