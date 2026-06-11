// Simple in-memory fixed-window rate limiter, keyed by caller-supplied string
// (e.g. "reset-password:1.2.3.4"). Suitable for the single-container deployment;
// counts reset on app restart.

const windows = new Map<string, { count: number; resetAt: number }>()

/**
 * Record an attempt and report whether the caller is within the limit.
 * Returns { ok: false, retryAfterSeconds } once `max` attempts have been made
 * within `windowMs`. `firstExceedance` is true only on the first blocked
 * attempt of a window, so callers can alert once instead of per attempt.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSeconds: number; firstExceedance: boolean } {
  const now = Date.now()
  const entry = windows.get(key)

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  entry.count++
  if (entry.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
      firstExceedance: entry.count === max + 1,
    }
  }
  return { ok: true }
}
