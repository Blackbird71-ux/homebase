// In-memory ring buffer for server-side log lines.
// Patched into console methods by instrumentation.ts so logs are viewable
// from the admin panel without SSH access.

export interface LogLine {
  ts: string       // ISO timestamp
  level: 'log' | 'info' | 'warn' | 'error'
  msg: string
}

const MAX_LINES = 500

class LogBuffer {
  private buf: LogLine[] = []

  push(level: LogLine['level'], args: unknown[]) {
    const msg = args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
    this.buf.push({ ts: new Date().toISOString(), level, msg })
    if (this.buf.length > MAX_LINES) this.buf.shift()
  }

  lines(n = MAX_LINES): LogLine[] {
    return this.buf.slice(-n)
  }

  clear() {
    this.buf = []
  }
}

// Singleton — shared across all imports in the same Node.js process
const globalKey = '__homebase_log_buffer__'
const g = globalThis as typeof globalThis & { [globalKey]?: LogBuffer }
if (!g[globalKey]) g[globalKey] = new LogBuffer()

export const logBuffer: LogBuffer = g[globalKey]
