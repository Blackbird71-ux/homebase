// In-memory ring buffers for server-side log lines.
// Patched into console methods and process.stdout/stderr by instrumentation.ts
// so logs are viewable from the admin panel without SSH / docker access.

export interface LogLine {
  ts: string       // ISO timestamp
  level: 'log' | 'info' | 'warn' | 'error'
  msg: string
}

const MAX_LINES = 500
const MAX_RAW_BYTES = 512_000 // ~0.5 MB of raw stdout/stderr text

// ── Structured log buffer (console.log / info / warn / error) ───────────────

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

// ── Raw stdout / stderr buffer (equivalent to `docker logs` output) ──────────

class RawLogBuffer {
  private buf = ''

  write(chunk: string) {
    this.buf += chunk
    // Keep the buffer from growing unbounded by trimming from the front
    if (this.buf.length > MAX_RAW_BYTES) {
      this.buf = this.buf.slice(this.buf.length - MAX_RAW_BYTES)
    }
  }

  text(): string {
    return this.buf
  }

  clear() {
    this.buf = ''
  }
}

// ── Singletons — shared across all imports in the same Node.js process ───────

const structuredKey = '__homebase_log_buffer__'
const rawKey = '__homebase_raw_log_buffer__'
const g = globalThis as typeof globalThis & {
  [structuredKey]?: LogBuffer
  [rawKey]?: RawLogBuffer
}
if (!g[structuredKey]) g[structuredKey] = new LogBuffer()
if (!g[rawKey]) g[rawKey] = new RawLogBuffer()

export const logBuffer: LogBuffer = g[structuredKey]
export const rawLogBuffer: RawLogBuffer = g[rawKey]
