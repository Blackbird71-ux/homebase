import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { Client } from 'ssh2'
import type { SessionUser } from '@/types'

// POST /api/admin/nas-logs
// Connects to the NAS host via SSH and runs `docker logs homebase-app --tail N`.
// Credentials are passed in the request body and never persisted server-side.
// Admin only. Uses auth() directly (not requireSession) to avoid redirect throws in API routes.
async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  try {
    const body = await req.json() as {
      host?: string
      username?: string
      password?: string
      n?: unknown
      port?: unknown
    }

    const { host, username, password } = body
    if (!host || !username || !password) {
      return NextResponse.json({ error: 'host, username, and password are required' }, { status: 400 })
    }

    const n = Math.min(Math.max(isNaN(Number(body.n)) ? 100 : Number(body.n), 1), 500)
    const port = isNaN(Number(body.port)) ? 22 : Number(body.port)
    const output = await new Promise<string>((resolve, reject) => {
      const conn = new Client()
      let out = ''

      conn.on('ready', () => {
        // Merge stderr into stdout so startup errors are included (same as docker logs default)
        conn.exec(`docker logs homebase-app --tail ${n} 2>&1`, (err, stream) => {
          if (err) { conn.end(); reject(err); return }
          stream.on('data', (chunk: Buffer) => { out += chunk.toString() })
          stream.stderr.on('data', (chunk: Buffer) => { out += chunk.toString() })
          stream.on('close', () => { conn.end(); resolve(out) })
        })
      })

      conn.on('error', reject)

      conn.connect({ host, port, username, password, readyTimeout: 10_000 })
    })

    return NextResponse.json({ output, n })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export const POST = withRouteErrors(_POST)
