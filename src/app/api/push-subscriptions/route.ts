import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { endpoint, p256dh, auth: authKey } = body

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'endpoint, p256dh, and auth are required' }, { status: 400 })
  }

  // Upsert: update existing subscription for this endpoint, or create new one
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      p256dh,
      auth: authKey,
      enabled: true,
      userId: user.id,
    },
    create: {
      endpoint,
      p256dh,
      auth: authKey,
      userId: user.id,
    },
  })

  return NextResponse.json(subscription, { status: 201 })
}

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    select: { id: true, enabled: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(subscriptions)
}

export async function PATCH(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, enabled } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.pushSubscription.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.pushSubscription.update({
    where: { id },
    data: { enabled },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.pushSubscription.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.pushSubscription.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
