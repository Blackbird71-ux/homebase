import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── GET /api/finance/income/[id]/attachments ──────────────────────────────────
// List all attachments for an income entry.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  const { id: incomeId } = await params

  const entry = await prisma.financeIncomeEntry.findFirst({
    where: { id: incomeId, familyId: session.familyId },
    select: { id: true },
  })
  if (!entry) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  const attachments = await prisma.incomeAttachment.findMany({
    where: { incomeId, familyId: session.familyId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(attachments)
}

// ── POST /api/finance/income/[id]/attachments ─────────────────────────────────
// Upload a new attachment (multipart/form-data).
// Fields: file (File), title (string)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  const { id: incomeId } = await params

  const entry = await prisma.financeIncomeEntry.findFirst({
    where: { id: incomeId, familyId: session.familyId },
    select: { id: true },
  })
  if (!entry) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const title = (formData.get('title') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const safeFilename = `${randomUUID()}.${ext}`

    // Store income attachments in data/income-attachments/
    const dir = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'income-attachments')
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(dir, safeFilename), buffer)

    const attachment = await prisma.incomeAttachment.create({
      data: {
        incomeId,
        familyId: session.familyId,
        title: title || file.name,
        fileName: safeFilename,
        fileSize: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        uploadedById: session.id,
      },
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (err) {
    console.error('[income-attachments] Upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}
