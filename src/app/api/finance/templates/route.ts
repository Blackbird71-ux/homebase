import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import {
  listTemplates,
  createTemplate,
  isKnownKind,
} from '@/lib/finance-recurring-template-service'

function parseDates(body: Record<string, unknown>) {
  return {
    ...body,
    startDate: body.startDate ? new Date(body.startDate as string) : undefined,
    endDate: body.endDate != null ? new Date(body.endDate as string) : undefined,
  }
}

async function _GET(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const includeDisabled = searchParams.get('includeDisabled') === 'true'
  const kindParam = searchParams.get('kind')
  const kind = kindParam && isKnownKind(kindParam) ? kindParam : undefined

  const templates = await listTemplates(user.familyId, { includeDisabled, kind })
  return NextResponse.json(templates)
}

async function _POST(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  try {
    const template = await createTemplate(user, parseDates(body) as Parameters<typeof createTemplate>[1])
    return NextResponse.json(template, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
