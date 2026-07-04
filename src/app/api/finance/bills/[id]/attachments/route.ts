import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── GET /api/finance/bills/[id]/attachments ───────────────────────────────────
// List all attachments for a bill.
async function _GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: billId } = await params

  // Verify bill belongs to this family
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: user.familyId },
    select: { id: true },
  })
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  const attachments = await prisma.billAttachment.findMany({
    where: { billId, familyId: user.familyId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(attachments)
}

// ── POST /api/finance/bills/[id]/attachments ──────────────────────────────────
// Upload a new attachment (multipart/form-data).
// Fields: file (File), title (string)
async function _POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: billId } = await params

  // Verify bill belongs to this family
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: user.familyId },
    select: { id: true },
  })
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const title = (formData.get('title') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const safeFilename = `${randomUUID()}.${ext}`

    // Store bill attachments in data/bill-attachments/ (separate from Document Vault)
    const dir = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'bill-attachments')
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(dir, safeFilename), buffer)

    const attachment = await prisma.billAttachment.create({
      data: {
        billId,
        familyId: user.familyId,
        title: title || file.name,
        fileName: safeFilename,
        fileSize: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        uploadedById: user.id,
      },
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (err) {
    console.error('[bill-attachments] Upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
