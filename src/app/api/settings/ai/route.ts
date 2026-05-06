import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()

  const data = await prisma.user.findUnique({
    where: { id: user.id },
    select: { geminiApiKey: true, aiModel: true },
  })

  return NextResponse.json({
    geminiApiKey: data?.geminiApiKey
      ? `...${data.geminiApiKey.slice(-4)}`
      : null,
    hasKey: !!data?.geminiApiKey,
    aiModel: data?.aiModel ?? 'gemini-2.0-flash',
  })
}

export async function PUT(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { geminiApiKey, aiModel } = body

  const updateData: { geminiApiKey?: string | null; aiModel?: string } = {}

  if (geminiApiKey !== undefined) {
    // Empty string means clear the key
    updateData.geminiApiKey = geminiApiKey === '' ? null : geminiApiKey
  }
  if (aiModel !== undefined) {
    const valid = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-pro']
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
