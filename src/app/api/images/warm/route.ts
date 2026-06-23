import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { warmRecipeImageCache } from '@/lib/image-cache'

// POST /api/images/warm
// Downloads and caches uncached recipe images server-side, in bounded batches.
// Requires an admin session — this is the logged-in replacement for the
// token-gated warm-image-cache ops script. Accepts an optional { limit } to cap
// how many images are attempted per call; re-run while `remaining > 0`.
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let limit = 100
  try {
    const body = await req.json()
    if (typeof body?.limit === 'number' && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), 500)
    }
  } catch {
    // No/invalid body — use the default limit.
  }

  const asOf = new Date()
  const result = await warmRecipeImageCache(limit)
  return NextResponse.json({ asOf, ...result })
}
