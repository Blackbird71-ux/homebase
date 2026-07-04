import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { hashPin } from '@/lib/secure-unlock'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { createAuditLog } from '@/lib/audit-log'

async function _GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const document = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
    select: {
      id: true,
      title: true,
      category: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      notes: true,
      expiryDate: true,
      remindBefore: true,
      uploadedById: true,
      pinHash: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: { id: true, name: true },
      },
    },
  })

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...document,
    isSecured: !!document.pinHash,
    expiryDate: document.expiryDate?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  })
}

async function _PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { title, category, notes, expiryDate, remindBefore, pin } = body

  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (category !== undefined) updateData.category = category
  if (notes !== undefined) updateData.notes = notes
  if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null
  if (remindBefore !== undefined) updateData.remindBefore = remindBefore

  // Handle PIN changes
  if (pin !== undefined) {
    if (pin && typeof pin === 'string' && pin.length >= 4 && pin.length <= 6) {
      updateData.pinHash = await hashPin(pin)
    } else if (pin === null) {
      updateData.pinHash = null
    }
    // If pin is an empty string, leave current pinHash unchanged
  }

  const updated = await prisma.document.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      title: true,
      category: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      notes: true,
      expiryDate: true,
      remindBefore: true,
      uploadedById: true,
      pinHash: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: { id: true, name: true },
      },
    },
  })

  void createAuditLog(
    user,
    'update',
    'document',
    id,
    `Updated document "${updated.title}"`,
    { before: { title: existing.title, category: existing.category }, after: { title: updated.title, category: updated.category } }
  )

  return NextResponse.json({
    ...updated,
    isSecured: !!updated.pinHash,
    expiryDate: updated.expiryDate?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete the file from disk
  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'documents', existing.fileName)
    await unlink(filePath)
  } catch (err) {
    // File may not exist — that's okay
    console.warn('[documents] Could not delete file:', err)
  }

  // Delete the database record
  await prisma.document.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'document',
    id,
    `Deleted document "${existing.title}"`,
    { document: { title: existing.title, category: existing.category, fileName: existing.fileName } }
  )

  return NextResponse.json({ success: true })
}


export const GET = withRouteErrors(_GET)
export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
