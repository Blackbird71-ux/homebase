import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { getAuditLogs } from '@/lib/audit-log'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const entity = searchParams.get('entity') ?? undefined
  const entityId = searchParams.get('entityId') ?? undefined

  const result = await getAuditLogs(user.familyId, {
    limit: Math.min(limit, 100),
    offset,
    entity: entity as any,
    entityId,
  })

  return NextResponse.json(result)
}
