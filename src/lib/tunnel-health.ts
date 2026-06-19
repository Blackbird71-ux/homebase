// Runtime health helpers for the in-process Cloudflare tunnel.
//
// cloudflared runs inside this container (launched by docker/entrypoint.sh in a
// supervised restart-loop) and exposes its metrics + /ready health endpoint on
// loopback (--metrics 127.0.0.1:20241). These helpers query that endpoint and
// scan /proc for the live process — the authoritative signals for whether the
// tunnel is actually connected, not just whether its config files exist.
//
// All helpers degrade gracefully off-container (local dev on Windows/Mac): no
// /proc and no metrics server, so they return "not running" without throwing.
import http from 'http'
import fs from 'fs/promises'

// Loopback-only inside the container — never exposed externally.
export const METRICS_HOST = '127.0.0.1'
export const METRICS_PORT = 20241

/** Are we running inside the Docker container (Linux) rather than local dev? */
export async function inContainer(): Promise<boolean> {
  if (process.platform !== 'linux') return false
  try {
    await fs.access('/.dockerenv')
    return true
  } catch {
    try {
      await fs.access('/proc/uptime')
      return true
    } catch {
      return false
    }
  }
}

/** Minimal HTTP GET to a loopback address with a short timeout. */
export function httpGet(
  host: string,
  port: number,
  path: string,
  timeoutMs = 3000,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')) })
    req.end()
  })
}

/**
 * Query cloudflared's canonical /ready endpoint — the authoritative health signal.
 * 200 => tunnel has live edge connections. 503 => process up but not connected yet.
 * Connection refused => metrics server (and almost certainly the tunnel) is not running.
 */
export async function queryReady(): Promise<{
  reachable: boolean
  ready: boolean
  readyConnections: number | null
  raw: string | null
}> {
  try {
    const { statusCode, body } = await httpGet(METRICS_HOST, METRICS_PORT, '/ready')
    let readyConnections: number | null = null
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed.readyConnections === 'number') readyConnections = parsed.readyConnections
    } catch { /* body not JSON — ignore */ }
    return { reachable: true, ready: statusCode === 200, readyConnections, raw: body.slice(0, 200) }
  } catch {
    return { reachable: false, ready: false, readyConnections: null, raw: null }
  }
}

/** Find the PID of the running cloudflared process by scanning /proc. Returns null if none. */
export async function findCloudflaredPid(): Promise<number | null> {
  try {
    const entries = await fs.readdir('/proc')
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue
      try {
        const cmdline = await fs.readFile(`/proc/${entry}/cmdline`, 'utf8')
        // cmdline is NUL-separated; the binary path is the first token
        const argv0 = cmdline.split('\0')[0] || ''
        if (argv0.endsWith('cloudflared') || argv0 === 'cloudflared') {
          return Number(entry)
        }
      } catch { /* process vanished or unreadable — skip */ }
    }
  } catch { /* no /proc — not in container */ }
  return null
}

/** Uptime of a process from /proc, formatted. Socket-free and reflects true tunnel uptime. */
export async function processUptime(pid: number): Promise<string | null> {
  try {
    const [statRaw, uptimeRaw] = await Promise.all([
      fs.readFile(`/proc/${pid}/stat`, 'utf8'),
      fs.readFile('/proc/uptime', 'utf8'),
    ])
    // Field 2 (comm) may contain spaces/parens — split on the last ')'
    const afterComm = statRaw.slice(statRaw.lastIndexOf(')') + 2)
    const fields = afterComm.split(' ')
    // After comm, field index 0 = state (field 3). starttime is field 22 => index 19.
    const starttimeTicks = Number(fields[19])
    const systemUptimeSec = Number(uptimeRaw.split(' ')[0])
    const HZ = 100 // USER_HZ on Linux
    const sec = Math.max(0, Math.floor(systemUptimeSec - starttimeTicks / HZ))
    const days = Math.floor(sec / 86400)
    const hours = Math.floor((sec % 86400) / 3600)
    const mins = Math.floor((sec % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  } catch {
    return null
  }
}

/** Is the app origin reachable over loopback? (what cloudflared proxies to) */
export async function checkOriginReachable(): Promise<boolean> {
  try {
    const { statusCode } = await httpGet('127.0.0.1', 3000, '/api/health')
    return statusCode === 200
  } catch {
    return false
  }
}
