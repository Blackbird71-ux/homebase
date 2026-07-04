import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return new Promise<NextResponse>((resolve) => {
    let url = ''
    let resolved = false

    const child = spawn('cloudflared', ['--origincert', '/etc/cloudflared/cert.pem', 'tunnel', 'login'])

    function captureUrl(data: Buffer) {
      const text = data.toString()
      const match = text.match(/https:\/\/\S+cloudflare\S+/i)
      if (match && !url) {
        url = match[0].replace(/[.,;)\]>]+$/, '')
        if (!resolved) {
          resolved = true
          resolve(NextResponse.json({ url }))
        }
      }
    }

    child.stdout.on('data', captureUrl)
    child.stderr.on('data', captureUrl)

    child.on('error', () => {
      if (!resolved) {
        resolved = true
        resolve(NextResponse.json({ error: 'cloudflared not available — make sure you are running inside the Docker container.' }, { status: 500 }))
      }
    })

    // Fallback if URL not captured within 5 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (url) {
          resolve(NextResponse.json({ url }))
        } else {
          child.kill()
          resolve(NextResponse.json({ error: 'cloudflared did not return a login URL. Check container logs.' }, { status: 500 }))
        }
      }
    }, 5000)
  })
}

export const POST = withRouteErrors(_POST)
