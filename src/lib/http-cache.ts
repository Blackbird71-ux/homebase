import { createHash } from 'crypto'

/**
 * JSON success response with a strong ETag + If-None-Match revalidation.
 *
 * The service worker (public/sw.js) revalidates its offline API cache by
 * replaying GETs with If-None-Match taken from the cached copy. When the
 * payload is unchanged the route answers with an empty 304 instead of the
 * full body, so keeping the offline cache warm costs almost no data.
 *
 * Uses plain Response (not NextResponse) so it stays importable in vitest —
 * the forked Next build has no next/server export for the test runner.
 * Apply to cacheable GET success paths only; error responses stay as-is.
 */
export function jsonWithETag(req: Request, data: unknown): Response {
  const body = JSON.stringify(data)
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`
  const ifNoneMatch = req.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', ETag: etag },
  })
}
