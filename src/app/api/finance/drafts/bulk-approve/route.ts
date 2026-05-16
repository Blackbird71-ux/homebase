import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { bulkApproveUnchangedDrafts } from '@/lib/finance-draft-approval-service'
import type { TemplateKind } from '@/lib/finance-recurring-template-service'

export async function POST(req: NextRequest) {
  const user = await requireSession()
  const { kind } = await req.json()

  if (kind !== 'bill' && kind !== 'income') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }

  try {
    const result = await bulkApproveUnchangedDrafts(user, kind as TemplateKind)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
