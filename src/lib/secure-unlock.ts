// src/lib/secure-unlock.ts
// Utility for PIN-based secure content protection

import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10
const UNLOCK_SESSION_PREFIX = 'secure_unlock_'
const UNLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Hash a PIN for storage.
 * Returns the bcrypt hash string.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS)
}

/**
 * Verify a PIN against a stored hash.
 * Returns true if the PIN matches.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

/**
 * Generate a secure unlock session token.
 * This is stored in the user's session/cookies to indicate
 * they've successfully unlocked a secure item.
 */
export function generateUnlockToken(entityType: string, entityId: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 15)
  return `${UNLOCK_SESSION_PREFIX}${entityType}_${entityId}_${timestamp}_${random}`
}

/**
 * Check if an unlock token is still valid (within the 15-minute window).
 */
export function isUnlockTokenValid(token: string): boolean {
  try {
    const parts = token.split('_')
    const timestamp = parseInt(parts[parts.length - 2], 10)
    return Date.now() - timestamp < UNLOCK_DURATION_MS
  } catch {
    return false
  }
}

/**
 * Get the unlock session cookie name for a specific entity.
 */
export function getUnlockCookieName(entityType: string, entityId: string): string {
  return `${UNLOCK_SESSION_PREFIX}${entityType}_${entityId}`
}

export { UNLOCK_DURATION_MS }
