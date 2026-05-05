import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { createAuditLog } from '@/lib/audit-log'
import { hashPin } from '@/lib/secure-unlock'


export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const expiringSoon = searchParams.get('expiringSoon') === 'true'

  const where: Record<string, unknown> = { familyId: user.familyId }
  if (category) where.category = category
  if (expiringSoon) {
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    where.expiryDate = { lte: thirtyDaysFromNow, gte: new Date() }
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
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

  return NextResponse.json(
    documents.map((doc) => ({
      ...doc,
      isSecured: !!doc.pinHash,
      pinHash: undefined,
      expiryDate: doc.expiryDate?.toISOString() ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const category = (formData.get('category') as string) ?? 'other'
    const notes = (formData.get('notes') as string) ?? null
    const expiryDate = (formData.get('expiryDate') as string) ?? null
    const remindBefore = parseInt((formData.get('remindBefore') as string) ?? '30', 10)
    const pin = formData.get('pin') as string | null

    // Hash PIN if provided
    let pinHash: string | undefined
    if (pin && typeof pin === 'string' && pin.length >= 4) {
      pinHash = await hashPin(pin)
    }

    if (!file || !title) {

      return NextResponse.json(
        { error: 'File and title are required' },
        { status: 400 }
      )
    }

    // Generate a unique filename to avoid collisions
    const ext = file.name.split('.').pop() ?? 'bin'
    const safeFilename = `${randomUUID()}.${ext}`

    // Ensure documents directory exists
    const documentsDir = join(process.cwd(), 'data', 'documents')
    await mkdir(documentsDir, { recursive: true })

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = join(documentsDir, safeFilename)
    await writeFile(filePath, buffer)

    // Create database record
    const document = await prisma.document.create({
      data: {
        familyId: user.familyId,
        title,
        category,
        fileName: safeFilename,
        fileSize: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        notes,
        pinHash: pinHash ?? null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        remindBefore,
        uploadedById: user.id,
      },

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
      'create',
      'document',
      document.id,
      `Uploaded document "${title}"`,
      { document: { title, category, fileName: safeFilename, fileSize: buffer.length } }
    )

    return NextResponse.json(
      {
        ...document,
        isSecured: !!document.pinHash,
        pinHash: undefined,
        expiryDate: document.expiryDate?.toISOString() ?? null,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[documents] Upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
