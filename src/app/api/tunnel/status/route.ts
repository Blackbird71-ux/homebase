import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import {
  inContainer,
  queryReady,
  findCloudflaredPid,
  processUptime,
  checkOriginReachable,
} from '@/lib/tunnel-health'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i

function findCredentialsFile(): string | null {
  try {
    const files = readdirSync('/etc/cloudflared')
    return files.find((f) => UUID_RE.test(f)) ?? null
  } catch { return null }
}

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const credsFile = findCredentialsFile()
  let tunnelId: string | null = null
  if (credsFile) {
    try {
      const creds = JSON.parse(readFileSync(`/etc/cloudflared/${credsFile}`, 'utf8'))
      tunnelId = creds.TunnelID ?? null
    } catch { /* ignore */ }
  }

  // Runtime health: query cloudflared's /ready endpoint and scan /proc for the
  // live process. These are the authoritative signals for whether the tunnel is
  // actually connected — the wizard fields above only reflect config presence.
  // Off-container (local dev) these no-op to "not running" without throwing.
  let running = false
  let readyConnections: number | null = null
  let processAlive = false
  let originReachable = false
  let uptime: string | null = null
  const inDocker = await inContainer()
  if (inDocker) {
    const [ready, pid, origin] = await Promise.all([
      queryReady(),
      findCloudflaredPid(),
      checkOriginReachable(),
    ])
    running = ready.ready
    readyConnections = ready.readyConnections
    processAlive = pid !== null
    originReachable = origin
    uptime = pid !== null ? await processUptime(pid) : null
  }

  return NextResponse.json({
    loggedIn: existsSync('/etc/cloudflared/cert.pem'),
    tunnelCreated: !!credsFile,
    configured: existsSync('/etc/cloudflared/config.yml'),
    tunnelId,
    // Runtime health (null/false off-container)
    inContainer: inDocker,
    running,
    readyConnections,
    processAlive,
    originReachable,
    uptime,
  })
}

export const GET = withRouteErrors(_GET)
