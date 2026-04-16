import crypto from 'crypto'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_LENGTH = 8

export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  return Array.from(bytes)
    .map(b => CHARSET[b % CHARSET.length])
    .join('')
}

export function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code)
}
