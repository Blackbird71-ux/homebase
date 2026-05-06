import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

const VALID_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-pro'],
  deepseek: ['deepseek-chat'],
}

export async function GET() {
  const user = await requireSession()

  const data = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiApiKey: true, aiProvider: true, aiModel: true },
  })

  const provider = data?.aiProvider ?? 'gemini'

  return NextResponse.json({
    aiApiKey: data?.aiApiKey ? `...${data.aiApiKey.slice(-4)}` : null,
    hasKey: !!data?.aiApiKey,
    aiProvider: provider,
    aiModel: data?.aiModel ?? 'gemini-2.0-flash',
  })
}

export async function PUT(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { aiApiKey, aiProvider, aiModel } = body

  const updateData: { aiApiKey?: string | null; aiProvider?: string; aiModel?: string } = {}

  if (aiApiKey !== undefined) {
    updateData.aiApiKey = aiApiKey === '' ? null : aiApiKey
  }
  if (aiProvider !== undefined) {
    if (!Object.keys(VALID_MODELS).includes(aiProvider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }
    updateData.aiProvider = aiProvider
  }
  if (aiModel !== undefined) {
    const provider = aiProvider ?? (await prisma.user.findUnique({ where: { id: user.id }, select: { aiProvider: true } }))?.aiProvider ?? 'gemini'
    const valid = VALID_MODELS[provider] ?? []
    if (!valid.includes(aiModel)) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 })
    }
    updateData.aiModel = aiModel
  }

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}
