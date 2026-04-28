import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
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

  try {
    const filePath = join(process.cwd(), 'data', 'documents', document.fileName)
    const buffer = await readFile(filePath)

    // Use original filename for download
    const originalName = document.title + '.' + document.fileName.split('.').pop()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${originalName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[documents] Download failed:', err)
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}
