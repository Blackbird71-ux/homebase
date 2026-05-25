import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { approveBillDraft, approveIncomeDraft } from '@/lib/finance-draft-approval-service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { kind } = await req.json()

  try {
    if (kind === 'bill') {
      const result = await approveBillDraft(user, id)
      return NextResponse.json(result)
    } else if (kind === 'income') {
      const result = await approveIncomeDraft(user, id)
      return NextResponse.json(result)
    } else {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
