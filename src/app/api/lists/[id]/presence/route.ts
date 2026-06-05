import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Scope to the caller's family — don't leak presence for another family's list.
  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { leave } = body

  // Scope to the caller's family — never trust a list id that isn't theirs.
  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const listPresence = getListPresence(id)

  // Identity comes from the authenticated session, not the request body.
  if (leave) {
    listPresence.delete(user.id)
    return NextResponse.json({ success: true })
  }

  listPresence.set(user.id, {
    name: user.name ?? 'Unknown',
    lastSeen: Date.now(),
  })

  return NextResponse.json({ success: true })
}
