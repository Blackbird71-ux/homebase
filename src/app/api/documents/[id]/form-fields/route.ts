// src/app/api/documents/[id]/form-fields/route.ts
// Detects and returns AcroForm fields in a PDF document.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { detectFormFields } from '@/lib/pdf/form-fields'

export async function GET(
  _req: Request,
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

  // Only PDFs have form fields
  if (document.mimeType !== 'application/pdf' && !document.fileName.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Not a PDF document' }, { status: 400 })
  }

  try {
    const filePath = join(process.cwd(), 'data', 'documents', document.fileName)
    const buffer = await readFile(filePath)
    const result = await detectFormFields(new Uint8Array(buffer))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[form-fields] Detection failed:', err)
    return NextResponse.json({ error: 'Failed to detect form fields' }, { status: 500 })
  }
}
