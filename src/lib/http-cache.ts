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
 *
 * Cache-Control is 'private, no-cache': these payloads are per-user and, for
 * live/time-sensitive collections (chore schedule, lists, events), must never
 * be served stale. Without an explicit directive a response carrying an ETag
 * becomes eligible for HTTP heuristic freshness — the browser (or Cloudflare,
 * which also rewrites the strong ETag to a weak W/"…") can then answer the
 * service worker's revalidation from cache WITHOUT hitting the origin, freezing
 * a stale copy (e.g. overdue chores missing from the dashboard "All" view).
 * 'no-cache' = may store, but must always revalidate against the origin first;
 * the ETag still yields a cheap 304 when the body is genuinely unchanged. This
 * does not affect the service worker's own Cache Storage (offline still works —
 * the Cache Storage API ignores Cache-Control).
 */
export function jsonWithETag(req: Request, data: unknown): Response {
  const body = JSON.stringify(data)
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`
  const cacheControl = 'private, no-cache'
  const ifNoneMatch = req.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': cacheControl },
  })
}
