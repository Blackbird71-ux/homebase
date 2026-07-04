import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const books = await prisma.recipeBook.findMany({
    where: { familyId: user.familyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { recipes: true } } },
  })
  return NextResponse.json(
    books.map((b) => ({ id: b.id, name: b.name, hidden: b.hidden, recipeCount: b._count.recipes }))
  )
}

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await req.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const book = await prisma.recipeBook.create({
    data: { name: name.trim(), familyId: user.familyId },
  })

  void createAuditLog(
    user,
    'create',
    'recipe',
    book.id,
    `Created recipe book "${book.name}"`,
    { recipeBook: { name: book.name } }
  )

  return NextResponse.json({ id: book.id, name: book.name }, { status: 201 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
