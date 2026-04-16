import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { parseRecipePage } from '@/lib/recipe-scraper'

export async function POST(req: Request) {
  await requireSession()
  const body = await req.json()
  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  let html: string
  try {
    const res = await fetch(url, {
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
