// src/app/api/documents/[id]/form-data/route.ts
// Saves filled form data back into a PDF, optionally saving as a new document.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { fillFormFields } from '@/lib/pdf/form-fields'
import type { FormFieldValues } from '@/lib/pdf/form-fields'
import { createAuditLog } from '@/lib/audit-log'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const document = await prisma.document.findFirst({
    where: { id, familyId: user.familyId },
  })

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check PIN protection
  if (document.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('document', id)
    const unlockCookie = cookieStore.get(cookieName)
    const isUnlocked = unlockCookie?.value && isUnlockTokenValid(unlockCookie.value)

    if (!isUnlocked) {
      return NextResponse.json({ error: 'Document is PIN-protected. Please unlock first.' }, { status: 403 })
    }
  }

  const body = await req.json()
  const { values, saveAsNew } = body as { values: FormFieldValues; saveAsNew?: boolean }

  if (!values || typeof values !== 'object') {
    return NextResponse.json({ error: 'Field values are required' }, { status: 400 })
  }

  try {
    const filePath = join(process.cwd(), 'data', 'documents', document.fileName)
    const buffer = await readFile(filePath)
    const filledPdf = await fillFormFields(new Uint8Array(buffer), values)

    if (saveAsNew) {
      // Save as a new document in the vault
      const safeFilename = `${randomUUID()}.pdf`
      const documentsDir = join(process.cwd(), 'data', 'documents')
      await mkdir(documentsDir, { recursive: true })
      await writeFile(join(documentsDir, safeFilename), Buffer.from(filledPdf))

      const newDoc = await prisma.document.create({
        data: {
          familyId: user.familyId,
          title: `${document.title} (filled)`,
          category: document.category,
          fileName: safeFilename,
          fileSize: filledPdf.length,
          mimeType: 'application/pdf',
          notes: `Filled form derived from "${document.title}"`,
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
          uploadedBy: { select: { id: true, name: true } },
        },
      })

      void createAuditLog(
        user,
        'create',
        'document',
        newDoc.id,
        `Filled form "${newDoc.title}" from "${document.title}"`,
        { source: document.id },
      )

      return NextResponse.json({
        ...newDoc,
        isSecured: !!newDoc.pinHash,
        pinHash: undefined,
        expiryDate: newDoc.expiryDate?.toISOString() ?? null,
        createdAt: newDoc.createdAt.toISOString(),
        updatedAt: newDoc.updatedAt.toISOString(),
      }, { status: 201 })
    }

    // Return filled PDF as download
    return new NextResponse(filledPdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.title.replace(/[^a-zA-Z0-9 _-]/g, '')}-filled.pdf"`,
        'Content-Length': String(filledPdf.length),
      },
    })

  } catch (err) {
    console.error('[form-data] Save failed:', err)
    return NextResponse.json({ error: 'Failed to fill form' }, { status: 500 })
  }
}
