import { NextResponse } from 'next/server'
import { execSync, spawn } from 'child_process'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Stop any running cloudflared process
    try { execSync('pkill -f "cloudflared tunnel" 2>/dev/null || true') } catch { /* ignore */ }

    // Give it a moment to exit
    await new Promise(r => setTimeout(r, 500))

    // Start cloudflared detached
    const child = spawn(
      'cloudflared',
      ['tunnel', '--no-autoupdate', '--config', '/etc/cloudflared/config.yml', 'run'],
      { detached: true, stdio: 'ignore' }
    )
    child.unref()

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
