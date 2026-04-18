import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { requireSession } from '@/lib/auth-helpers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i

function findCredentialsFile(): string | null {
  try {
    const files = readdirSync('/etc/cloudflared')
    return files.find((f) => UUID_RE.test(f)) ?? null
  } catch { return null }
}

export async function GET() {
  const session = await requireSession()
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const credsFile = findCredentialsFile()
  let tunnelId: string | null = null
  if (credsFile) {
    try {
      const creds = JSON.parse(readFileSync(`/etc/cloudflared/${credsFile}`, 'utf8'))
      tunnelId = creds.TunnelID ?? null
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    loggedIn: existsSync('/etc/cloudflared/cert.pem'),
    tunnelCreated: !!credsFile,
    configured: existsSync('/etc/cloudflared/config.yml'),
    tunnelId,
  })
}
