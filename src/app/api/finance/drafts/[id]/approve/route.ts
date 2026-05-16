import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { approveBillDraft, approveIncomeDraft } from '@/lib/finance-draft-approval-service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
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
