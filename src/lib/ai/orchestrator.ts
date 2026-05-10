// src/lib/ai/orchestrator.ts
// Main orchestration logic: collects all registered tools, builds context,
// calls the LLM, and dispatches to the correct tool handler.

import { getAllDefinitions, executeTool } from './tool-registry'
import { callAIProvider } from './provider'
import { buildSystemPrompt, type ContextBuilderOptions } from './context-builder'
import type { SessionUser } from './types'
import type { FunctionDeclaration } from '@google/generative-ai'

// ── Re-exported helpers (used by individual tool modules) ────────────────────

/**
 * Resolve a day name ("Monday", "today", "tomorrow") to an ISO date string.
 * Uses the user's timezone for correct date calculation.
 */
export function resolveDayToDate(dayName: string, userTimezone: string): string {
  const now = new Date()
  const { format, addDays, startOfWeek, parseISO } = require('date-fns')
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone })
  const today = parseISO(todayStr)

  const lower = dayName.toLowerCase().trim()
  if (lower === 'today') return todayStr
  if (lower === 'tomorrow') return format(addDays(today, 1), 'yyyy-MM-dd')
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return lower

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(lower)
  if (targetIdx === -1) return todayStr

  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const candidate = addDays(weekStart, targetIdx === 0 ? 6 : targetIdx - 1)
  const candidateStr = format(candidate, 'yyyy-MM-dd')
  if (candidateStr < todayStr) {
    return format(addDays(candidate, 7), 'yyyy-MM-dd')
  }
  return candidateStr
}

/**
 * Safe JSON parse expecting a string array.
 */
export function safeParseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// ── Orchestrator options ─────────────────────────────────────────────────────

export interface OrchestrateOptions {
  text: string
  user: SessionUser
  aiApiKey: string
  aiProvider: string
  aiModel: string
  timezone: string
  userName: string
}

// ── Orchestrator result ──────────────────────────────────────────────────────

export interface OrchestrateResult {
  message: string
  action?: string
  [key: string]: unknown
}

// ── Main orchestration ───────────────────────────────────────────────────────

/**
 * Main entry point for processing an AI command.
 *
 * 1. Builds the system prompt from all registered tool context providers
 * 2. Collects all tool function declarations
 * 3. Calls the AI provider
 * 4. Executes the matched tool handler
 * 5. Returns the result
 */
export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
  const { text, user, aiApiKey, aiProvider, aiModel, timezone, userName } = options

  // 1. Build system prompt
  const systemPrompt = await buildSystemPrompt(user.familyId, user.id, {
    timezone,
    userName,
  })

  // 2. Collect all tool definitions
  const functionDeclarations: FunctionDeclaration[] = getAllDefinitions()

  // 3. Call AI provider
  const aiResult = await callAIProvider(
    aiProvider,
    aiApiKey,
    aiModel,
    systemPrompt,
    text,
    functionDeclarations
  )

  // 4. Handle text response (no function call — e.g. unknown)
  if ('textResponse' in aiResult) {
    return {
      message: aiResult.textResponse || "I didn't understand that. Try asking me to add a recipe to the meal plan, create a note, add items to your shopping list, or ask what's on the calendar.",
    }
  }

  const { fnName, args } = aiResult

  // 5. Handle the 'unknown' fallback tool
  if (fnName === 'unknown') {
    return {
      message: (args as { message: string }).message,
    }
  }

  // 6. Execute the matched tool handler
  const handlerResult = await executeTool(fnName, args, { user, familyId: user.familyId })

  return handlerResult
}
