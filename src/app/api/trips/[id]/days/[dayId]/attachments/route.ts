import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// GET /api/trips/[id]/days/[dayId]/attachments — list day-level attachments
async function _GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: tripId, dayId } = await params

  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId, trip: { familyId: user.familyId } },
    select: { id: true },
  })
  if (!day) return NextResponse.json({ error: 'Day not found' }, { status: 404 })

  const attachments = await prisma.tripAttachment.findMany({
    where: { tripId, dayId, familyId: user.familyId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(attachments)
}

// POST /api/trips/[id]/days/[dayId]/attachments — upload a day-level attachment
async function _POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: tripId, dayId } = await params

  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId, trip: { familyId: user.familyId } },
    select: { id: true },
  })
  if (!day) return NextResponse.json({ error: 'Day not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const title = (formData.get('title') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const safeFilename = `${randomUUID()}.${ext}`

    const dir = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'trip-attachments')
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(dir, safeFilename), buffer)

    const attachment = await prisma.tripAttachment.create({
      data: {
        tripId,
        dayId,
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
    console.error('[trip-day-attachments] Upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
