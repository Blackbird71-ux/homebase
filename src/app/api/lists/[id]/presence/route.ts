import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// In-memory presence store (resets on server restart, which is fine for this use case)
const presenceMap = new Map<string, Map<string, { name: string; lastSeen: number }>>()

function getListPresence(listId: string) {
  if (!presenceMap.has(listId)) {
    presenceMap.set(listId, new Map())
  }
  return presenceMap.get(listId)!
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireSession()
  const { id } = await params

  const listPresence = getListPresence(id)
  const now = Date.now()
  const STALE_THRESHOLD = 45000

  const users: Array<{ userId: string; name: string; lastSeen: number }> = []
  for (const [userId, data] of listPresence) {
    if (now - data.lastSeen < STALE_THRESHOLD) {
      users.push({ userId, name: data.name, lastSeen: data.lastSeen })
    } else {
      listPresence.delete(userId)
    }
  }

  return NextResponse.json({ users })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { userId, leave } = body

  if (leave) {
    const listPresence = getListPresence(id)
    listPresence.delete(userId)
    return NextResponse.json({ success: true })
  }

  // Get user's display name
  const dbUser = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { name: true },
  })

  const listPresence = getListPresence(id)
  listPresence.set(userId, {
    name: dbUser?.name ?? 'Unknown',
    lastSeen: Date.now(),
  })

  return NextResponse.json({ success: true })
}
