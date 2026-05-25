import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

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
