// src/app/api/documents/[id]/export-annotated/route.ts
// Burns annotations into a PDF and returns the annotated PDF for download,
// or saves it as a new document in the vault.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { burnAnnotationsIntoPdf } from '@/lib/pdf/burn-annotations'
import type { PdfAnnotationSet } from '@/types/pdf-annotations'
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
  const { saveAsNew } = body as { saveAsNew?: boolean }

  try {
    // Read original PDF
    const filePath = join(process.cwd(), 'data', 'documents', document.fileName)
    const buffer = await readFile(filePath)

    // Read annotations sidecar
    const annotationsDir = join(process.cwd(), 'data', 'documents', 'annotations')
    let annotations: PdfAnnotationSet['annotations'] = []
    try {
      const annotationData = await readFile(join(annotationsDir, `${id}.json`), 'utf-8')
      const parsed: PdfAnnotationSet = JSON.parse(annotationData)
      annotations = parsed.annotations
    } catch {
      // No annotations exist — export the original PDF as-is
    }

    // Burn annotations into the PDF
    const annotatedPdf = await burnAnnotationsIntoPdf(new Uint8Array(buffer), annotations)

    if (saveAsNew) {
      // Save as a new document in the vault
      const safeFilename = `${randomUUID()}.pdf`
      const documentsDir = join(process.cwd(), 'data', 'documents')
      await mkdir(documentsDir, { recursive: true })
      await writeFile(join(documentsDir, safeFilename), Buffer.from(annotatedPdf))

      const newDoc = await prisma.document.create({
        data: {
          familyId: user.familyId,
          title: `${document.title} (annotated)`,
          category: document.category,
          fileName: safeFilename,
          fileSize: annotatedPdf.length,
          mimeType: 'application/pdf',
          notes: `Annotated version of "${document.title}"`,
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
        `Annotated PDF "${newDoc.title}" from "${document.title}"`,
      )

      return NextResponse.json({
        ...newDoc,
        isSecured: !!newDoc.pinHash,
        pinHash: undefined,
        expiryDate: newDoc.expiryDate?.toISOString() ?? null,
        createdAt: newDoc.createdAt.toISOString(),
        updatedAt: newDoc.updatedAt.toISOString(),
      })
    }

    // Return the annotated PDF for download
    return new NextResponse(Buffer.from(annotatedPdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.fileName.replace(/\.pdf$/i, '')}-annotated.pdf"`,
        'Content-Length': String(annotatedPdf.length),
      },
    })
  } catch (err) {
    console.error('[export-annotated] Failed:', err)
    return NextResponse.json({ error: 'Failed to export annotated PDF' }, { status: 500 })
  }
}
