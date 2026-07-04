import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { inContainer, findCloudflaredPid, queryReady } from '@/lib/tunnel-health'

export const dynamic = 'force-dynamic'

/**
 * Restart the in-process tunnel by terminating the cloudflared process.
 * The supervisor loop in docker/entrypoint.sh respawns it within ~5 seconds —
 * we must NOT spawn our own cloudflared here, or two instances would run (the
 * supervisor would start one too). Just signal the PID and let it come back.
 */
async function _POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!(await inContainer())) {
    return NextResponse.json(
      { error: 'Not running in a container — tunnel control is unavailable in local dev.' },
      { status: 400 },
    )
  }

  const pid = await findCloudflaredPid()
  if (pid === null) {
    return NextResponse.json({
      ok: true,
      message: 'cloudflared was not running; the supervisor will start it within ~5s.',
      running: false,
    })
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to signal cloudflared: ${message}` }, { status: 500 })
  }

  // Give the supervisor time to respawn (it sleeps 5s after exit) and reconnect.
  await new Promise((r) => setTimeout(r, 8000))
  const ready = await queryReady()

  return NextResponse.json({
    ok: true,
    message: ready.ready
      ? 'Tunnel restarted and reconnected to Cloudflare.'
      : 'Tunnel process signalled. Reconnecting — refresh in a few seconds.',
    running: ready.ready,
    readyConnections: ready.readyConnections,
  })
}

export const POST = withRouteErrors(_POST)
