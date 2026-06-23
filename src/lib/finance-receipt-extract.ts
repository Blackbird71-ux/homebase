// src/lib/finance-receipt-extract.ts
// Server-only helper: extract structured expense data from a receipt photo using
// the user's configured vision-capable AI provider (Gemini). This is PURE
// EXTRACTION — it never posts to the GL. The caller pre-fills the normal
// bill/expense form with these suggestions; the user reviews and confirms, and
// the actual ledger write goes through the existing posting helpers unchanged.

import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { callAIProvider, type VisionImage } from '@/lib/ai/provider'
import { prisma } from '@/lib/prisma'

// ── Result shape ──────────────────────────────────────────────────────────────

export interface ReceiptLineItem {
  description: string
  amount: number | null
}

export interface ReceiptExtraction {
  vendor: string | null
  /** Calendar date as ISO yyyy-MM-dd, ready for a <input type="date">. */
  date: string | null
  /** GST-inclusive total. */
  total: number | null
  /** GST component included in the total (Australian standard 1/11 of total). */
  gstAmount: number | null
  currency: string | null
  suggestedCategoryName: string | null
  /** Existing expense FinanceCategory matched by name, or null if no confident match. */
  matchedCategoryId: string | null
  lineItems: ReceiptLineItem[]
}

export type ExtractReceiptResult =
  | { ok: true; data: ReceiptExtraction }
  | { ok: false; error: string }

// ── Extraction function-call schema ───────────────────────────────────────────

const RECORD_RECEIPT: FunctionDeclaration = {
  name: 'record_receipt',
  description: 'Record the structured data read from a scanned receipt or tax invoice.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      vendor: { type: SchemaType.STRING, description: 'The merchant / supplier name as printed on the receipt.' },
      date: { type: SchemaType.STRING, description: 'The transaction date in ISO format yyyy-MM-dd. Australian receipts print dates as dd/mm/yyyy — convert accordingly.' },
      total: { type: SchemaType.NUMBER, description: 'The GST-inclusive grand total actually paid, as a number with no currency symbol.' },
      gstAmount: { type: SchemaType.NUMBER, description: 'The GST (tax) component included in the total, if shown. For Australian GST-inclusive totals this is total/11. Use 0 if the receipt shows no GST.' },
      currency: { type: SchemaType.STRING, description: 'ISO currency code, e.g. AUD. Default AUD if not shown.' },
      suggestedCategoryName: { type: SchemaType.STRING, description: 'A short expense category that best describes this purchase, e.g. "Groceries", "Fuel", "Dining", "Office Supplies", "Hardware".' },
      lineItems: {
        type: SchemaType.ARRAY,
        description: 'Individual line items if clearly legible. Omit if the receipt is not itemised.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            description: { type: SchemaType.STRING, description: 'Item description.' },
            amount: { type: SchemaType.NUMBER, description: 'Line amount.' },
          },
          required: ['description'],
        },
      },
    },
    required: ['total'],
  },
}

const SYSTEM_PROMPT =
  'You are a meticulous bookkeeping assistant reading a photographed receipt or tax invoice. ' +
  'Extract only what is actually printed — never invent values. The image may be skewed, ' +
  'cropped, or low quality. Read the GST-inclusive grand total (the amount actually paid), the ' +
  'merchant name, and the transaction date. Receipts are usually Australian: dates are dd/mm/yyyy ' +
  'and totals are GST-inclusive (GST = total / 11 when a "Tax Invoice" shows GST). ' +
  'Always respond by calling the record_receipt function.'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

/** Normalise a model-supplied date to ISO yyyy-MM-dd, or null if unparseable. */
function normaliseDate(v: unknown): string | null {
  const s = toStringOrNull(v)
  if (!s) return null
  // Already ISO-ish.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // dd/mm/yyyy or dd-mm-yyyy (Australian).
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${year}-${month}-${day}`
  }
  return null
}

/**
 * Match a suggested category name against the family's existing expense
 * categories. Case-insensitive: exact name first, then substring either way.
 * Never creates a category — returns null when there's no confident match so
 * the user picks one manually.
 */
export async function matchExpenseCategory(familyId: string, name: string | null): Promise<string | null> {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  if (!lower) return null

  const categories = await prisma.financeCategory.findMany({
    where: { familyId, type: 'expense', hideFromReports: false },
    select: { id: true, name: true },
  })

  const exact = categories.find(c => c.name.toLowerCase() === lower)
  if (exact) return exact.id

  const contains = categories.find(c => c.name.toLowerCase().includes(lower))
  if (contains) return contains.id

  const within = categories.find(c => lower.includes(c.name.toLowerCase()))
  return within?.id ?? null
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractReceipt(opts: {
  image: VisionImage
  provider: string
  apiKey: string
  model: string
  familyId: string
}): Promise<ExtractReceiptResult> {
  const { image, provider, apiKey, model, familyId } = opts

  let result
  try {
    result = await callAIProvider(
      provider,
      apiKey,
      model,
      SYSTEM_PROMPT,
      'Read this receipt and record its details.',
      [RECORD_RECEIPT],
      image,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed'
    return { ok: false, error: message }
  }

  if (!('fnName' in result)) {
    return { ok: false, error: "Couldn't read the receipt. Try a clearer, well-lit photo." }
  }

  const args = result.args
  const suggestedCategoryName = toStringOrNull(args.suggestedCategoryName)

  const rawItems = Array.isArray(args.lineItems) ? args.lineItems : []
  const lineItems: ReceiptLineItem[] = rawItems
    .map((it): ReceiptLineItem | null => {
      const item = it as Record<string, unknown>
      const description = toStringOrNull(item.description)
      if (!description) return null
      return { description, amount: toNumberOrNull(item.amount) }
    })
    .filter((it): it is ReceiptLineItem => it !== null)

  const data: ReceiptExtraction = {
    vendor: toStringOrNull(args.vendor),
    date: normaliseDate(args.date),
    total: toNumberOrNull(args.total),
    gstAmount: toNumberOrNull(args.gstAmount),
    currency: toStringOrNull(args.currency) ?? 'AUD',
    suggestedCategoryName,
    matchedCategoryId: await matchExpenseCategory(familyId, suggestedCategoryName),
    lineItems,
  }

  return { ok: true, data }
}
