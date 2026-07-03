import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const book = await prisma.recipeBook.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: { name?: string; hidden?: boolean } = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    const name = body.name.trim()
    if (name !== book.name) {
      const clash = await prisma.recipeBook.findFirst({
        where: { familyId: user.familyId, name, NOT: { id } },
      })
      if (clash) return NextResponse.json({ error: 'A book with that name already exists' }, { status: 409 })
    }
    data.name = name
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') {
      return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
    }
    data.hidden = body.hidden
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await prisma.recipeBook.update({ where: { id }, data })

  void createAuditLog(
    user,
    'update',
    'recipe',
    id,
    `Updated recipe book "${book.name}"${data.name && data.name !== book.name ? ` → "${data.name}"` : ''}${data.hidden !== undefined ? ` (${data.hidden ? 'hidden' : 'visible'})` : ''}`,
    { recipeBook: { name: updated.name, hidden: updated.hidden } }
  )

  return NextResponse.json({ id: updated.id, name: updated.name, hidden: updated.hidden })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const book = await prisma.recipeBook.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.recipeBook.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'recipe',
    id,
    `Deleted recipe book "${book.name}"`,
    { recipeBook: { name: book.name } }
  )

  return NextResponse.json({ ok: true })
}
