// src/app/api/ai/command/route.ts
// Refactored to use the AI Tool Registry orchestrator.
// This file is now a thin HTTP adapter — all business logic lives in tool modules.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// ── Tool Registry: auto-registers all tools at import time ──────────────────
// Importing registerAllTools triggers registration of every tool module.
// This must happen before any orchestration call.

import { registerAllTools } from '@/lib/ai/tools/index'
import { orchestrate } from '@/lib/ai/orchestrator'
import { getActionEventMap, getRegisteredToolNames } from '@/lib/ai/tool-registry'

// Register all tools once at module load
registerAllTools()

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireSession>>
  try {
    user = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { text } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    // Load user AI settings
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        aiApiKey: true,
        aiProvider: true,
        aiModel: true,
        name: true,
        family: { select: { timezone: true } },
      },
    })

    if (!userRecord?.aiApiKey) {
      return NextResponse.json(
        { error: 'No AI API key configured. Go to Settings → AI to add your key.' },
        { status: 400 }
      )
    }

    const provider = userRecord.aiProvider ?? 'gemini'
    const defaultModel = provider === 'deepseek' ? 'deepseek-chat' : 'gemini-2.0-flash'
    const model = userRecord.aiModel ?? defaultModel
    const timezone = userRecord.family?.timezone ?? 'UTC'

    // Delegate to orchestrator
    const result = await orchestrate({
      text,
      user: {
        id: user.id,
        email: user.email,
        name: userRecord.name ?? user.email,
        familyId: user.familyId,
        role: user.role,
      },
      aiApiKey: userRecord.aiApiKey,
      aiProvider: provider,
      aiModel: model,
      timezone,
      userName: userRecord.name ?? user.email,
    })

    // Attach action-to-event mapping so the frontend knows which events to dispatch
    const actionEventMap = getActionEventMap()
    const event = result.action ? actionEventMap.get(result.action) ?? null : null

    return NextResponse.json({
      ...result,
      event,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── GET handler: diagnostic endpoint to list registered tools ───────────────

export async function GET() {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const toolNames = getRegisteredToolNames()
  const actionEventMap = getActionEventMap()

  const eventMap: Record<string, string> = {}
  for (const [action, event] of actionEventMap) {
    eventMap[action] = event
  }

  return NextResponse.json({
    tools: toolNames.sort(),
    toolCount: toolNames.length,
    actionEvents: eventMap,
  })
}
