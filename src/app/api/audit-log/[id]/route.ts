import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getAuditLogById, undoAuditLog } from '@/lib/audit-log'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const entry = await getAuditLogById(id, user.familyId)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(entry)
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const result = await undoAuditLog(user, id)
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: result.message })
}
