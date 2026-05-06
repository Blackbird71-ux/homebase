import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
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
    const filePath = join(process.cwd(), 'data', 'documents', document.fileName)
    const buffer = await readFile(filePath)

    // Determine content type for inline viewing
    const mimeType = document.mimeType || 'application/octet-stream'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${document.fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
        // Allow PDF to be embedded in iframe
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('[documents] View failed:', err)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
