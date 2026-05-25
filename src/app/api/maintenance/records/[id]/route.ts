import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const record = await prisma.maintenanceRecord.findUnique({ where: { id } })
  if (!record || record.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.maintenanceRecord.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
