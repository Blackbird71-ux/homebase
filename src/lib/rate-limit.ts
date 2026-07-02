// Simple in-memory fixed-window rate limiter, keyed by caller-supplied string
// (e.g. "reset-password:1.2.3.4"). Suitable for the single-container deployment;
// counts reset on app restart.

import { NextResponse } from 'next/server'

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

/**
 * Per-IP fixed-window rate limit for an unauthenticated route. Logs the
 * exceedance and returns the generic 429 response to send, or null when the
 * request is within the limit. The response shape is deliberately generic —
 * it must not reveal whether the underlying email/token/code was valid.
 */
export function enforceIpRateLimit(
  req: Request,
  route: string,
  max: number,
  windowMs: number
): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = checkRateLimit(`${route}:${ip}`, max, windowMs)
  if (!limit.ok) {
    console.warn(`[${route}] Rate limit exceeded from ${ip}`)
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }
  return null
}
