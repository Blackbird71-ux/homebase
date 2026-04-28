import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { unlink } from 'fs/promises'
import { join } from 'path'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
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
    expiryDate: document.expiryDate?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { title, category, notes, expiryDate, remindBefore } = body

  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (category !== undefined) updateData.category = category
  if (notes !== undefined) updateData.notes = notes
  if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null
  if (remindBefore !== undefined) updateData.remindBefore = remindBefore

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
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: { id: true, name: true },
      },
    },
  })

  return NextResponse.json({
    ...updated,
    expiryDate: updated.expiryDate?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete the file from disk
  try {
    const filePath = join(process.cwd(), 'data', 'documents', existing.fileName)
    await unlink(filePath)
  } catch (err) {
    // File may not exist — that's okay
    console.warn('[documents] Could not delete file:', err)
  }

  // Delete the database record
  await prisma.document.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
