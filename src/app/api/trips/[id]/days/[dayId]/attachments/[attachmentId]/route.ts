import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'

type Ctx = { params: Promise<{ id: string; dayId: string; attachmentId: string }> }

// GET /api/trips/[id]/days/[dayId]/attachments/[attachmentId] — serve file
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await requireSession()
  const { attachmentId } = await params

  const attachment = await prisma.tripAttachment.findFirst({
    where: { id: attachmentId, familyId: session.familyId },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'trip-attachments', attachment.fileName)
    const buffer = await readFile(filePath)
    const ext = attachment.fileName.split('.').pop() ?? 'bin'
    const downloadName = `${attachment.title}.${ext}`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${downloadName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}

// DELETE /api/trips/[id]/days/[dayId]/attachments/[attachmentId] — delete
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await requireSession()
  const { attachmentId } = await params

  const attachment = await prisma.tripAttachment.findFirst({
    where: { id: attachmentId, familyId: session.familyId },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'trip-attachments', attachment.fileName)
    await unlink(filePath)
  } catch {
    // ignore missing file
  }

  await prisma.tripAttachment.delete({ where: { id: attachmentId } })
  return NextResponse.json({ success: true })
}
