// src/lib/ai/provider.ts
// LLM provider adapter — handles calling Gemini or OpenAI-compatible providers.
// Extracted from the original monolithic /api/ai/command/route.ts

import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, FunctionCallingMode } from '@google/generative-ai'
import OpenAI from 'openai'

// ── Supported providers ──────────────────────────────────────────────────────

export const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  // Add more OpenAI-compatible providers here as needed:
  // openai: 'https://api.openai.com/v1',
}

// ── Result types ─────────────────────────────────────────────────────────────

export type AIResult =
  | { fnName: string; args: Record<string, unknown> }
  | { textResponse: string }

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call the configured AI provider with a system prompt, user text, and
 * a list of function declarations. Returns either a function call result
 * or a text response.
 *
 * Supports:
 *   - Google Gemini (native function calling)
 *   - OpenAI-compatible APIs (DeepSeek, OpenAI, etc.) via tool calls
 */
export async function callAIProvider(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  text: string,
  functionDeclarations: FunctionDeclaration[]
): Promise<AIResult> {
  if (provider !== 'gemini') {
    return callOpenAICompatible(provider, apiKey, model, systemPrompt, text, functionDeclarations)
  }
  return callGemini(apiKey, model, systemPrompt, text, functionDeclarations)
}

// ── OpenAI-compatible providers (DeepSeek, OpenAI, etc.) ────────────────────

async function callOpenAICompatible(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  text: string,
  functionDeclarations: FunctionDeclaration[]
): Promise<AIResult> {
  const baseURL = PROVIDER_BASE_URLS[provider]
  if (!baseURL) {
    return { textResponse: `Provider "${provider}" is not configured.` }
  }

  const openai = new OpenAI({ apiKey, baseURL })

  const tools: OpenAI.ChatCompletionTool[] = functionDeclarations.map(fn => ({
    type: 'function' as const,
    function: {
      name: fn.name,
      description: fn.description ?? '',
      parameters: fn.parameters as unknown as Record<string, unknown>,
    },
  }))

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    tools,
    tool_choice: 'required',
  })

  const choice = response.choices[0]?.message
  const toolCall = choice?.tool_calls?.[0]

  if (!toolCall || toolCall.type !== 'function') {
    return { textResponse: choice?.content ?? "I didn't understand that." }
  }

  return {
    fnName: toolCall.function.name,
    args: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
  }
}

// ── Google Gemini ────────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  text: string,
  functionDeclarations: FunctionDeclaration[]
): Promise<AIResult> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } },
    systemInstruction: systemPrompt,
  })

  const result = await geminiModel.generateContent(text)
  const response = result.response
  const part = response.candidates?.[0]?.content?.parts?.[0]

  if (!part?.functionCall) {
    return { textResponse: response.text() ?? "I didn't understand that." }
  }

  return {
    fnName: part.functionCall.name,
    args: part.functionCall.args as Record<string, unknown>,
  }
}
