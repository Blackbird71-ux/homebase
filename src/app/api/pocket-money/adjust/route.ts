import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { adjustPocketMoney } from '@/lib/pocket-money'

// Manual top-up or deduction — admin only.
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { userId, amount, note } = body

  const parsedAmount = Number(amount)
  if (!userId || !Number.isFinite(parsedAmount) || parsedAmount === 0) {
    return NextResponse.json({ error: 'userId and a non-zero amount are required' }, { status: 400 })
  }

  // Target must be in the admin's own family.
  const target = await prisma.user.findFirst({ where: { id: userId, familyId: user.familyId } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const entry = await adjustPocketMoney({
    familyId: user.familyId,
    userId,
    amount: parsedAmount,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
    createdById: user.id,
  })

  return NextResponse.json(entry, { status: 201 })
}
