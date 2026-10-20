import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { parseRecipePage, extractPageUrl } from '@/lib/recipe-scraper'

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { url, html: pastedHtml } = body

  // Pasted page source (for sites that block server-side fetches, e.g. bot protection)
  if (pastedHtml !== undefined) {
    if (typeof pastedHtml !== 'string' || !pastedHtml.trim()) {
      return NextResponse.json({ error: 'html must be a non-empty string' }, { status: 400 })
    }
    if (pastedHtml.length > 5_000_000) {
      return NextResponse.json({ error: 'html is too large' }, { status: 413 })
    }
    return NextResponse.json(parseRecipePage(pastedHtml, (typeof url === 'string' && url.trim()) || extractPageUrl(pastedHtml)))
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Validate URL is a safe external https URL (prevent SSRF)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: 'url is not a valid URL' }, { status: 400 })
  }
  if (parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'url must use https' }, { status: 400 })
  }
  // Block private/loopback IP ranges
  const hostname = parsedUrl.hostname
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
  ]
  if (privatePatterns.some((p) => p.test(hostname))) {
    return NextResponse.json({ error: 'url must not target a private address' }, { status: 400 })
  }

  let html: string
  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; HomebaseBot/1.0; +https://homebase.family)',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${res.status}` },
        { status: 422 }
      )
    }
    html = await res.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const parsed = parseRecipePage(html, url)
  return NextResponse.json(parsed)
}

export const POST = withRouteErrors(_POST)
