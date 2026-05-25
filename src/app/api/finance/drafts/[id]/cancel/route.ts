import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { cancelDraft } from '@/lib/finance-draft-approval-service'
import type { TemplateKind } from '@/lib/finance-recurring-template-service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { kind } = await req.json()

  if (kind !== 'bill' && kind !== 'income') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  try {
    const result = await cancelDraft(user, kind as TemplateKind, id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
