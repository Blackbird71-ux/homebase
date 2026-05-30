// src/app/api/documents/[id]/annotations/route.ts
// API routes for reading and writing PDF annotation data.
// Annotations are stored as sidecar JSON files alongside the PDF on disk.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { PdfAnnotationSet } from '@/types/pdf-annotations'

function getAnnotationsPath(documentId: string): string {
  return join(process.cwd(), 'data', 'documents', 'annotations', `${documentId}.json`)
}

async function checkAccess(documentId: string, user: SessionUser): Promise<{ ok: boolean; status?: number; error?: string }> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, familyId: user.familyId },
    select: { id: true, pinHash: true },
  })

  if (!document) {
    return { ok: false, status: 404, error: 'Document not found' }
  }

  // Check PIN protection
  if (document.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('document', documentId)
    const unlockCookie = cookieStore.get(cookieName)
    const isUnlocked = unlockCookie?.value && isUnlockTokenValid(unlockCookie.value)

    if (!isUnlocked) {
      return { ok: false, status: 403, error: 'Document is PIN-protected. Please unlock first.' }
    }
  }

  return { ok: true }
}

// ─── GET /api/documents/[id]/annotations ─────────────────────────────────────
// Returns the annotation set for a document. Returns empty set if none exist.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const access = await checkAccess(id, user)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  try {
    const filePath = getAnnotationsPath(id)
    const data = await readFile(filePath, 'utf-8')
    const annotations: PdfAnnotationSet = JSON.parse(data)
    return NextResponse.json(annotations)
  } catch {
    // No annotations file yet — return empty set
    return NextResponse.json({
      documentId: id,
      version: 1,
      annotations: [],
      updatedAt: new Date().toISOString(),
    } satisfies PdfAnnotationSet)
  }
}

// ─── PUT /api/documents/[id]/annotations ─────────────────────────────────────
// Saves (overwrites) the annotation set for a document.

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const access = await checkAccess(id, user)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  try {
    const body = await req.json()
    const { annotations } = body

    if (!Array.isArray(annotations)) {
      return NextResponse.json({ error: 'Invalid annotations data' }, { status: 400 })
    }

    // Read existing to get current version
    let currentVersion = 1
    try {
      const existingData = await readFile(getAnnotationsPath(id), 'utf-8')
      const existing: PdfAnnotationSet = JSON.parse(existingData)
      currentVersion = existing.version
    } catch {
      // No existing file — start at version 1
    }

    const annotationSet: PdfAnnotationSet = {
      documentId: id,
      version: currentVersion + 1,
      annotations,
      updatedAt: new Date().toISOString(),
    }

    // Ensure directory exists
    const filePath = getAnnotationsPath(id)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(annotationSet, null, 2))

    return NextResponse.json(annotationSet)
  } catch (err) {
    console.error('[annotations] Save failed:', err)
    return NextResponse.json({ error: 'Failed to save annotations' }, { status: 500 })
  }
}
