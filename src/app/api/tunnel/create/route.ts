import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
// --origincert is a global flag — must come before the subcommand
const CERT = '--origincert /etc/cloudflared/cert.pem'

function run(cmd: string) {
  return execSync(cmd, { encoding: 'utf8', timeout: 30000 })
}

function errOutput(e: unknown): string {
  const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
  return err.stdout ?? err.stderr ?? err.message ?? String(e)
}

async function _POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const output = run(`cloudflared tunnel create homebase 2>&1`)
    const match = output.match(UUID_RE)
    if (!match) {
      return NextResponse.json({ error: `Could not parse tunnel ID from: ${output}` }, { status: 500 })
    }
    return NextResponse.json({ tunnelId: match[0] })
  } catch (createErr) {
    const createMsg = errOutput(createErr)
    if (createMsg.includes('already exist') || createMsg.includes('name is already used')) {
      try {
        const listOutput = run(`cloudflared tunnel list 2>&1`)
        for (const line of listOutput.split('\n')) {
          if (line.toLowerCase().includes('homebase')) {
            const match = line.match(UUID_RE)
            if (match) return NextResponse.json({ tunnelId: match[0], reused: true })
          }
        }
        return NextResponse.json({ error: `Tunnel exists but ID not found. List:\n${listOutput}` }, { status: 500 })
      } catch (listErr) {
        return NextResponse.json({ error: `Create and list both failed:\n${errOutput(listErr)}` }, { status: 500 })
      }
    }
    return NextResponse.json({ error: createMsg }, { status: 500 })
  }
}

export const POST = withRouteErrors(_POST)
