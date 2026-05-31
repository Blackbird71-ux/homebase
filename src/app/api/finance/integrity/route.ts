import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { runFinanceIntegrityAudit } from '@/lib/finance-integrity'

// GET /api/finance/integrity
// Runs the read-only finance integrity audit for the caller's family and returns
// every row↔GL divergence and broken accounting invariant. Admin only.
// Uses auth() directly (not requireAdmin) to avoid redirect throws in API routes.
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const result = await runFinanceIntegrityAudit(user.familyId)
  return NextResponse.json(result)
}
