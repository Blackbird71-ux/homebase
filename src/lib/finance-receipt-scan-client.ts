// src/lib/finance-receipt-scan-client.ts
// Client-safe helper: POST a receipt photo to the scan endpoint and return the
// extracted suggestions. The type-only import of ReceiptExtraction is erased at
// build time, so this stays free of the server-only prisma import in
// finance-receipt-extract.ts and is safe to call from client components.

import type { ReceiptExtraction } from './finance-receipt-extract'

export type { ReceiptExtraction }

/**
 * Send a receipt image to /api/finance/receipts/scan and return the structured
 * suggestions. Throws with the server's error message on failure (no AI key,
 * non-vision model, rate limit, unreadable image) so callers can toast it.
 */
export async function scanReceipt(file: File): Promise<ReceiptExtraction> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/finance/receipts/scan', { method: 'POST', body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not read the receipt. Try a clearer photo.')
  }
  return body as ReceiptExtraction
}
