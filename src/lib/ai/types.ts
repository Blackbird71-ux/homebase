// src/lib/ai/types.ts
// Shared types for the AI Tool Registry system.

import type { FunctionDeclaration } from '@google/generative-ai'
import type { AppEventName } from '@/lib/app-events'

// ── Session context passed to every handler ──────────────────────────────────

export interface SessionUser {
  id: string
  email: string
  name: string
  familyId: string
  role: string
}

export interface HandlerContext {
  user: SessionUser
  familyId: string
  timezone?: string
}

// ── Tool definition ──────────────────────────────────────────────────────────

export type AiToolDefinition = FunctionDeclaration

export interface HandlerResult {
  message: string
  action?: string
  [key: string]: unknown
}

/**
 * A context provider returns a string that is injected into the LLM system prompt.
 * It can use the familyId / userId to fetch relevant data.
 */
export type ContextProvider = (familyId: string, userId: string) => Promise<string>

/**
 * A tool handler executes the business logic when the LLM calls the tool.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: HandlerContext
) => Promise<HandlerResult>

/**
 * An AiTool bundles everything needed to register a capability with the AI assistant.
 */
export interface AiTool {
  /** The function declaration sent to the LLM (name, description, parameters). */
  definition: AiToolDefinition

  /**
   * Optional: provides dynamic context to inject into the system prompt.
   * This is how a tool tells the AI about current data (e.g. "Available recipes: ...").
   */
  contextProvider?: ContextProvider

  /** Executes the tool when the LLM decides to call it. */
  handler: ToolHandler

  /**
   * Optional: maps action names (returned in HandlerResult.action) to app events
   * that the frontend should dispatch for UI refresh.
   */
  actionEvents?: Record<string, AppEventName>
}

// ── Orchestrator result ──────────────────────────────────────────────────────

export interface OrchestratorResult {
  message: string
  action?: string
  [key: string]: unknown
}
