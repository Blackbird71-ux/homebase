import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const book = await prisma.recipeBook.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.recipeBook.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
