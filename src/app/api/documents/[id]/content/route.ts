import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Dynamic imports for document parsing libraries
let mammoth: typeof import('mammoth') | null = null
let XLSX: typeof import('xlsx') | null = null

async function getMammoth() {
  if (!mammoth) {
    mammoth = await import('mammoth')
  }
  return mammoth
}

async function getXLSX() {
  if (!XLSX) {
    XLSX = await import('xlsx')
  }
  return XLSX
}

/**
 * GET /api/documents/[id]/content
 * Returns parsed content for in-browser viewing.
 * For .docx → HTML, .xlsx → HTML table, .txt/.md → text
 */
async function _GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  // Check if document is PIN-protected and needs unlocking
  if (document.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('document', id)
    const unlockCookie = cookieStore.get(cookieName)
    const isUnlocked = unlockCookie?.value && isUnlockTokenValid(unlockCookie.value)

    if (!isUnlocked) {
      return NextResponse.json(
        { error: 'Document is PIN-protected. Please unlock first.' },
        { status: 403 }
      )
    }
  }

  try {
    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'documents', document.fileName)
    const mimeType = document.mimeType || ''
    const ext = document.fileName.split('.').pop()?.toLowerCase() || ''

    // Word documents (.docx)
    if (
      mimeType.includes('word') ||
      mimeType.includes('officedocument') ||
      ext === 'docx'
    ) {
      const mammothLib = await getMammoth()
      const buffer = await readFile(filePath)
      const result = await mammothLib.convertToHtml({ buffer })
      return NextResponse.json({
        html: result.value,
        type: 'docx',
        warnings: result.messages.filter((m: { type: string }) => m.type === 'warning').map((m: { message: string }) => m.message),
      })
    }

    // Excel documents (.xlsx, .xls)
    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      ext === 'xlsx' ||
      ext === 'xls'
    ) {
      const xlsxLib = await getXLSX()
      const buffer = await readFile(filePath)
      const workbook = xlsxLib.read(buffer, { type: 'buffer' })

      // Render all sheets as HTML tables
      const sheetsHtml = workbook.SheetNames.map((sheetName: string) => {
        const sheet = workbook.Sheets[sheetName]
        const html = xlsxLib.utils.sheet_to_html(sheet, { id: `sheet-${sheetName}` })
        return `<div class="excel-sheet mb-6">
          <h3 class="excel-sheet-title text-sm font-semibold text-muted-foreground mb-2">${sheetName}</h3>
          ${html}
        </div>`
      }).join('\n')

      return NextResponse.json({
        html: `<div class="excel-workbook">${sheetsHtml}</div>`,
        type: 'xlsx',
        sheetNames: workbook.SheetNames,
      })
    }

    // Text files (.txt, .md, .csv, etc.)
    if (
      mimeType.startsWith('text/') ||
      ext === 'txt' ||
      ext === 'md' ||
      ext === 'csv'
    ) {
      const content = await readFile(filePath, 'utf-8')
      return NextResponse.json({
        text: content,
        type: 'text',
        ext,
      })
    }

    // Unsupported type for content parsing
    return NextResponse.json(
      { error: 'Content parsing not available for this file type', type: 'unsupported' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[documents] Content fetch failed:', err)
    return NextResponse.json({ error: 'Failed to read document content' }, { status: 500 })
  }
}

/**
 * PATCH /api/documents/[id]/content
 * Saves edited text content back to the file (text files only).
 */
async function _PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  // Check if document is PIN-protected and needs unlocking
  if (document.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('document', id)
    const unlockCookie = cookieStore.get(cookieName)
    const isUnlocked = unlockCookie?.value && isUnlockTokenValid(unlockCookie.value)

    if (!isUnlocked) {
      return NextResponse.json(
        { error: 'Document is PIN-protected. Please unlock first.' },
        { status: 403 }
      )
    }
  }

  const mimeType = document.mimeType || ''
  const ext = document.fileName.split('.').pop()?.toLowerCase() || ''

  // Only allow editing text files
  const isTextFile =
    mimeType.startsWith('text/') ||
    ext === 'txt' ||
    ext === 'md' ||
    ext === 'csv'

  if (!isTextFile) {
    return NextResponse.json(
      { error: 'Only text files can be edited via the browser' },
      { status: 400 }
    )
  }

  try {
    const body = await req.json()
    const { text } = body

    if (typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text content is required' },
        { status: 400 }
      )
    }

    const filePath = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'documents', document.fileName)
    await writeFile(filePath, text, 'utf-8')

    // Update the document's updatedAt timestamp
    await prisma.document.update({
      where: { id },
      data: { fileSize: Buffer.byteLength(text, 'utf-8') },
    })

    return NextResponse.json({ success: true, message: 'Document saved' })
  } catch (err) {
    console.error('[documents] Content save failed:', err)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}

export const GET = withRouteErrors(_GET)
export const PATCH = withRouteErrors(_PATCH)
