import { createHmac } from 'crypto'

interface TokenPayload {
  type: 'chore'
  id: string
  assigneeId: string
  exp: number
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set')
  return s
}

export function generateCompleteToken(type: 'chore', id: string, assigneeId: string): string {
  const payload: TokenPayload = { type, id, assigneeId, exp: Date.now() + 7 * 24 * 3600 * 1000 }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyCompleteToken(token: string): TokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac('sha256', secret()).update(data).digest('base64url')
    if (sig !== expected) return null
    const payload: TokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
