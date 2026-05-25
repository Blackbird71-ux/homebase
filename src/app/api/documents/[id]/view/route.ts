import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(
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
    const buffer = await readFile(filePath)

    // Determine content type for inline viewing
    const mimeType = document.mimeType || 'application/octet-stream'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${document.fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
        // Allow same-origin iframing (DocumentViewer embeds PDFs in an iframe).
        // X-Frame-Options SAMEORIGIN is set globally in next.config.ts;
        // the CSP frame-ancestors directive is the modern equivalent and
        // takes precedence in browsers that support it.
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    })
  } catch (err) {
    console.error('[documents] View failed:', err)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
