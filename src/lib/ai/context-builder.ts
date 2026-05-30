// src/lib/ai/context-builder.ts
// Aggregates context from all registered tool context providers and builds
// the system prompt for the AI. Supports both bulk and selective context loading.

import { getAllContextProviders } from './tool-registry'
import { todayStringInTz } from '@/lib/timezone'
import { format, addDays, parseISO } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextBuilderOptions {
  /** The family's timezone string (e.g. "Australia/Sydney") */
  timezone: string
  /** The current user's display name */
  userName: string
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the full system prompt by collecting context from all registered tool
 * context providers, plus standard preamble (today's date, timezone, user name).
 *
 * @param familyId - The family ID to scope data queries
 * @param userId - The current user's ID
 * @param options - Options including timezone and user name
 * @returns The complete system prompt string
 */
export async function buildSystemPrompt(
  familyId: string,
  userId: string,
  options: ContextBuilderOptions
): Promise<string> {
  const { timezone, userName } = options
  const nowStr = todayStringInTz(timezone)
  const weekday = new Date().toLocaleDateString('en-AU', { weekday: 'long', timeZone: timezone })

  // Collect context from all registered tools
  const providers = getAllContextProviders()
  const contextSections: string[] = []

  for (const { name, provider } of providers) {
    try {
      const context = await provider(familyId, userId, timezone)
      if (context) {
        contextSections.push(context)
      }
    } catch (err) {
      console.error(`[context-builder] Context provider "${name}" failed:`, err)
      // Gracefully degrade — a failed context provider shouldn't break the AI
      contextSections.push(`${name}: (unavailable due to error)`)
    }
  }

  // Build the full system prompt
  const sections = contextSections.join('\n\n')

  const systemPrompt = `You are a helpful AI assistant for a family household management app called HomeBase.
Today is ${nowStr} (${weekday}).
The family's timezone is ${timezone}.
The current user's name is ${userName}.

${sections}

IMPORTANT RULES:
- When the user mentions a recipe by name, search the recipe list above for matches.
- If you find EXACTLY ONE clear match (case-insensitive, partial match is fine), use its ID and proceed.
- If you find MULTIPLE close matches, do NOT guess. Instead, use the "unknown" function to ask the user which one they meant.
- If you find NO match, use the "unknown" function to tell the user you couldn't find that recipe and ask if they'd like to add it as a quick item or search for something else.
- When the user mentions a day like "Monday" or "tomorrow", resolve it to the correct date in the current or upcoming week.
- When the user mentions a chore by name, match it to the closest chore in the list above and use its ID.
- Always use function calls to perform actions — do not just describe what you would do.`

  return systemPrompt
}
