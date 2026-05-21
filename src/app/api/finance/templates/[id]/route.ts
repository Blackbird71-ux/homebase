import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import {
  updateTemplate,
  deleteTemplate,
  listTemplates,
} from '@/lib/finance-recurring-template-service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params
  const templates = await listTemplates(user.familyId, { includeDisabled: true, includeInactive: true })
  const template = templates.find(t => t.id === id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

function parseDates(body: Record<string, unknown>) {
  const out = { ...body }
  if (body.startDate != null) out.startDate = new Date(body.startDate as string)
  // endDate: null means clear it; undefined means not supplied
  if ('endDate' in body) {
    out.endDate = body.endDate ? new Date(body.endDate as string) : null
  }
  // nextSpawnDate (UI name) maps to nextOccurrenceDate (service/DB name)
  // Only convert when truthy — blank/null means "don't override", so we omit the key entirely
  if ('nextSpawnDate' in body) {
    if (body.nextSpawnDate) out.nextOccurrenceDate = new Date(body.nextSpawnDate as string)
    delete out.nextSpawnDate
  }
  return out
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  try {
    const template = await updateTemplate(user, id, parseDates(body) as Parameters<typeof updateTemplate>[2])
    return NextResponse.json(template)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params
  try {
    const result = await deleteTemplate(user, id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
