import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { categoryOrder } = body

  if (!Array.isArray(categoryOrder)) {
    return NextResponse.json({ error: 'categoryOrder must be an array' }, { status: 400 })
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.list.update({
    where: { id },
    data: { categoryOrder: JSON.stringify(categoryOrder) },
  })
  return NextResponse.json(updated)
}
