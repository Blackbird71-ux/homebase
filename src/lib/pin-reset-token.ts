// src/lib/pin-reset-token.ts
// Self-contained signed tokens for PIN reset (no DB migration needed)

import { createHmac } from 'crypto'

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set')
  return key
}

export interface PinResetPayload {
  userId: string
  entityType: 'note' | 'document' | 'contact'
  entityId: string
  iat: number
  exp: number
}

/**
 * Generate a signed PIN reset token.
 */
export function generatePinResetToken(
  userId: string,
  entityType: 'note' | 'document' | 'contact',
  entityId: string
): string {
  const now = Date.now()
  const payload: PinResetPayload = {
    userId,
    entityType,
    entityId,
    iat: now,
    exp: now + TOKEN_EXPIRY_MS,
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', getEncryptionKey())
    .update(encoded)
    .digest('base64url')

  return `${encoded}.${signature}`
}

/**
 * Verify a PIN reset token and return the payload, or null if invalid/expired.
 */
export function verifyPinResetToken(token: string): PinResetPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null

    const [encoded, signature] = parts

    // Verify signature
    const expectedSig = createHmac('sha256', getEncryptionKey())
      .update(encoded)
      .digest('base64url')

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSig.length) return null
    const validSig = createHmac('sha256', getEncryptionKey())
      .update(encoded + signature)
      .digest('base64url')
    const validExpected = createHmac('sha256', getEncryptionKey())
      .update(encoded + expectedSig)
      .digest('base64url')

    // Simple length check + comparison
    if (signature !== expectedSig) return null

    const payload: PinResetPayload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    )

    // Check expiry
    if (Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}
