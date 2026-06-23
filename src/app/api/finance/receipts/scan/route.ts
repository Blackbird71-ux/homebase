// src/app/api/finance/receipts/scan/route.ts
// Accepts a receipt photo and returns structured expense suggestions extracted
// by the caller's own vision-capable AI provider. This endpoint NEVER posts to
// the GL — it only returns suggestions for the user to review in the normal
// bill/expense form. The actual ledger write goes through the existing posting
// helpers unchanged.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'
import { supportsVision } from '@/lib/ai/provider'
import { extractReceipt } from '@/lib/finance-receipt-extract'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Spends the user's own AI quota — cap the rate per user.
  const limit = checkRateLimit(`receipt-scan:${user.id}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many scans. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    )
  }

  // Load the caller's AI settings (mirrors /api/ai/command).
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiApiKey: true, aiProvider: true, aiModel: true },
  })
  if (!userRecord?.aiApiKey) {
    return NextResponse.json(
      { error: 'No AI API key configured. Go to Settings → AI to add your key.' },
      { status: 400 },
    )
  }

  const provider = userRecord.aiProvider ?? 'gemini'
  if (!supportsVision(provider)) {
    return NextResponse.json(
      { error: 'Your AI model can\'t read images. Switch to a Gemini model in Settings → AI to scan receipts.' },
      { status: 400 },
    )
  }
  const model = userRecord.aiModel ?? 'gemini-2.0-flash'

  // Read the uploaded image.
  let file: File | null
  try {
    const formData = await req.formData()
    file = formData.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'Image is required.' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 10 MB).' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const result = await extractReceipt({
    image: { base64, mimeType: file.type },
    provider,
    apiKey: userRecord.aiApiKey,
    model,
    familyId: user.familyId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json(result.data)
}
