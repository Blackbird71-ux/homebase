// src/lib/ai/tool-registry.ts
// Singleton registry that maintains a map of tool names to AiTool definitions.
// Features self-register their tools via registerTool() at import time.

import type { AiTool, AiToolDefinition, ContextProvider, ToolHandler, HandlerResult, HandlerContext } from './types'
import type { AppEventName } from '@/lib/app-events'

// ── Registry state ───────────────────────────────────────────────────────────

const tools = new Map<string, AiTool>()

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a tool with the AI assistant.
 * Call this at module-level in each tool file.
 */
export function registerTool(name: string, tool: AiTool): void {
  if (tools.has(name)) {
    console.warn(`[tool-registry] Tool "${name}" is already registered — overwriting.`)
  }
  tools.set(name, tool)
}

/**
 * Check if a tool is already registered.
 */
export function hasTool(name: string): boolean {
  return tools.has(name)
}

/**
 * Get all registered tool function declarations for the LLM.
 */
export function getAllDefinitions(): AiToolDefinition[] {
  return Array.from(tools.values()).map(t => t.definition)
}

/**
 * Get all context providers from registered tools.
 * Returns an array of { name, provider } for selective or bulk execution.
 */
export function getAllContextProviders(): Array<{ name: string; provider: ContextProvider }> {
  const result: Array<{ name: string; provider: ContextProvider }> = []
  for (const [name, tool] of tools) {
    if (tool.contextProvider) {
      result.push({ name, provider: tool.contextProvider })
    }
  }
  return result
}

/**
 * Execute a registered tool handler by name.
 * Returns the handler result, or throws if the tool is not found.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: HandlerContext
): Promise<HandlerResult> {
  const tool = tools.get(name)
  if (!tool) {
    throw new Error(`Tool "${name}" not found in registry.`)
  }
  return tool.handler(args, ctx)
}

/**
 * Get action-to-event mappings from all registered tools.
 * Returns a map where keys are action strings and values are AppEventNames.
 */
export function getActionEventMap(): Map<string, AppEventName> {
  const map = new Map<string, AppEventName>()
  for (const tool of tools.values()) {
    if (tool.actionEvents) {
      for (const [action, event] of Object.entries(tool.actionEvents)) {
        map.set(action, event)
      }
    }
  }
  return map
}

/**
 * Get a specific tool's action-to-event map.
 */
export function getToolActionEvents(name: string): Record<string, AppEventName> | undefined {
  return tools.get(name)?.actionEvents
}

/**
 * Get all registered tool names (useful for debugging / diagnostics).
 */
export function getRegisteredToolNames(): string[] {
  return Array.from(tools.keys())
}
