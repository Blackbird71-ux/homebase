import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tunnelId, hostname } = await req.json()

  if (!tunnelId || !UUID_RE.test(tunnelId)) {
    return NextResponse.json({ error: 'Invalid tunnel ID — must be a UUID.' }, { status: 400 })
  }

  const host = (hostname ?? 'homebase.liddleapps.com').trim()

  // Credentials file is named by UUID, not "homebase.json"
  const config = `tunnel: ${tunnelId}
credentials-file: /etc/cloudflared/${tunnelId}.json

ingress:
  - hostname: ${host}
    service: http://localhost:3000
  - service: http_status:404
`
  try {
    writeFileSync('/etc/cloudflared/config.yml', config, 'utf8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to write config: ${message}` }, { status: 500 })
  }
}

export const POST = withRouteErrors(_POST)
