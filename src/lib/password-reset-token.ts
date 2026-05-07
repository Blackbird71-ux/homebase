import { createHmac } from 'crypto'

const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set')
  return key
}

export interface PasswordResetPayload {
  userId: string
  iat: number
  exp: number
}

export function generatePasswordResetToken(userId: string): string {
  const now = Date.now()
  const payload: PasswordResetPayload = { userId, iat: now, exp: now + TOKEN_EXPIRY_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', getKey()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [encoded, signature] = parts
    const expectedSig = createHmac('sha256', getKey()).update(encoded).digest('base64url')
    if (signature !== expectedSig) return null
    const payload: PasswordResetPayload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'))
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
