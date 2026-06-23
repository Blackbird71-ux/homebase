// src/lib/ai/provider.ts
// LLM provider adapter — handles calling Gemini or OpenAI-compatible providers.
// Extracted from the original monolithic /api/ai/command/route.ts

import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, FunctionCallingMode, type Part } from '@google/generative-ai'
import OpenAI from 'openai'

// ── Supported providers ──────────────────────────────────────────────────────

export const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  // Add more OpenAI-compatible providers here as needed:
  // openai: 'https://api.openai.com/v1',
}

// ── Vision support ───────────────────────────────────────────────────────────

/** An image to pass alongside the prompt for multimodal (vision) calls. */
export interface VisionImage {
  base64: string    // raw base64 (no data: prefix)
  mimeType: string  // e.g. 'image/jpeg'
}

/**
 * Whether the given provider can accept image input. Gemini models are
 * multimodal; DeepSeek's chat model is text-only. Callers that need vision
 * should gate on this and surface a friendly message rather than failing.
 */
export function supportsVision(provider: string): boolean {
  return provider === 'gemini'
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
  functionDeclarations: FunctionDeclaration[],
  image?: VisionImage
): Promise<AIResult> {
  if (provider !== 'gemini') {
    return callOpenAICompatible(provider, apiKey, model, systemPrompt, text, functionDeclarations, image)
  }
  return callGemini(apiKey, model, systemPrompt, text, functionDeclarations, image)
}

// ── OpenAI-compatible providers (DeepSeek, OpenAI, etc.) ────────────────────

async function callOpenAICompatible(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  text: string,
  functionDeclarations: FunctionDeclaration[],
  image?: VisionImage
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

  const userContent: OpenAI.ChatCompletionUserMessageParam['content'] = image
    ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      ]
    : text

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
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
  functionDeclarations: FunctionDeclaration[],
  image?: VisionImage
): Promise<AIResult> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } },
    systemInstruction: systemPrompt,
  })

  const parts: Part[] = [{ text }]
  if (image) {
    parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } })
  }

  const result = await geminiModel.generateContent(parts)
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
