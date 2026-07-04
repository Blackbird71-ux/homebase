import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { password } = await req.json()

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, familyId: true } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.familyId !== user.familyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id }, data: { password: hashed } })

  return NextResponse.json({ ok: true })
}

export const POST = withRouteErrors(_POST)
