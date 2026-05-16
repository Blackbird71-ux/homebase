import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
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

export async function GET(req: NextRequest) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const includeDisabled = searchParams.get('includeDisabled') === 'true'
  const kindParam = searchParams.get('kind')
  const kind = kindParam && isKnownKind(kindParam) ? kindParam : undefined

  const templates = await listTemplates(user.familyId, { includeDisabled, kind })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const user = await requireSession()
  const body = await req.json()
  try {
    const template = await createTemplate(user, parseDates(body) as Parameters<typeof createTemplate>[1])
    return NextResponse.json(template, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
