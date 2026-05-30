// src/app/api/documents/generate/route.ts
// API route for server-side PDF generation.
// Accepts structured data and returns a PDF buffer.
// Optionally saves the generated PDF to the Document Vault.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { createAuditLog } from '@/lib/audit-log'
import { generateTablePdf, generateTextPdf, generateBlankPdf } from '@/lib/pdf/generate'
import type { PdfTableColumn, PdfTableRow, PdfReportMeta } from '@/lib/pdf/generate'

// ─── Request types ────────────────────────────────────────────────────────────

interface GenerateTableRequest {
  type: 'table'
  meta: PdfReportMeta
  columns: PdfTableColumn[]
  rows: PdfTableRow[]
  /** If provided, the PDF will be saved to the Document Vault */
  saveToVault?: {
    title: string
    category?: string
    notes?: string
  }
}

interface GenerateTextRequest {
  type: 'text'
  title: string
  body: string[]
  subtitle?: string
  saveToVault?: {
    title: string
    category?: string
    notes?: string
  }
}

interface GenerateBlankRequest {
  type: 'blank'
  title: string
  saveToVault?: {
    title: string
    category?: string
    notes?: string
  }
}

type GenerateRequest = GenerateTableRequest | GenerateTextRequest | GenerateBlankRequest

// ─── POST /api/documents/generate ─────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body: GenerateRequest = await req.json()

    // Generate the PDF buffer
    let pdfBytes: Uint8Array
    let generatedName: string

    switch (body.type) {
      case 'table': {
        pdfBytes = await generateTablePdf(body.meta, body.columns, body.rows)
        generatedName = body.saveToVault?.title ?? body.meta.title
        break
      }
      case 'text': {
        pdfBytes = await generateTextPdf(body.title, body.body, body.subtitle)
        generatedName = body.saveToVault?.title ?? body.title
        break
      }
      case 'blank': {
        pdfBytes = await generateBlankPdf(body.title)
        generatedName = body.saveToVault?.title ?? body.title
        break
      }
      default:
        return NextResponse.json(
          { error: 'Invalid generation type. Must be "table", "text", or "blank".' },
          { status: 400 },
        )
    }

    // ── Optionally save to Document Vault ────────────────────────────────────
    if (body.saveToVault) {
      const safeFilename = `${randomUUID()}.pdf`

      const documentsDir = join(process.cwd(), 'data', 'documents')
      await mkdir(documentsDir, { recursive: true })

      const filePath = join(documentsDir, safeFilename)
      await writeFile(filePath, Buffer.from(pdfBytes))

      const document = await prisma.document.create({
        data: {
          familyId: user.familyId,
          title: body.saveToVault.title,
          category: body.saveToVault.category ?? 'financial',
          fileName: safeFilename,
          fileSize: pdfBytes.length,
          mimeType: 'application/pdf',
          notes: body.saveToVault.notes ?? null,
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
        `Generated PDF "${document.title}"`,
        { document: { title: document.title, category: document.category, fileName: safeFilename, fileSize: pdfBytes.length } },
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
        { status: 201 },
      )
    }

    // ── Return PDF as download ───────────────────────────────────────────────
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${generatedName.replace(/[^a-zA-Z0-9 _-]/g, '')}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    })

  } catch (err) {
    console.error('[documents/generate] Failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate PDF' },
      { status: 500 },
    )
  }
}
