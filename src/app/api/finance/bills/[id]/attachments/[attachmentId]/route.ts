import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'

type Ctx = { params: Promise<{ id: string; attachmentId: string }> }

// ── GET /api/finance/bills/[id]/attachments/[attachmentId] ────────────────────
// Download / view the attachment file.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { attachmentId } = await params

  const attachment = await prisma.billAttachment.findFirst({
    where: { id: attachmentId, familyId: user.familyId },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'bill-attachments', attachment.fileName)
    const buffer = await readFile(filePath)
    const ext = attachment.fileName.split('.').pop() ?? 'bin'
    const downloadName = `${attachment.title}.${ext}`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${downloadName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
        // Allow same-origin viewing/embedding; the global next.config.ts
        // header is SAMEORIGIN, but adding the CSP directive explicitly
        // ensures modern browsers honour it for PDF inline viewing.
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}

// ── DELETE /api/finance/bills/[id]/attachments/[attachmentId] ─────────────────
// Remove an attachment record and its file from disk.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { attachmentId } = await params

  const attachment = await prisma.billAttachment.findFirst({
    where: { id: attachmentId, familyId: user.familyId },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from disk (best-effort – don't fail if file is already gone)
  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'bill-attachments', attachment.fileName)
    await unlink(filePath)
  } catch {
    // ignore missing file
  }

  await prisma.billAttachment.delete({ where: { id: attachmentId } })
  return NextResponse.json({ success: true })
}
