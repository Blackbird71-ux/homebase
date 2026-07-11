// Server-only test-suite runner behind the admin "Test Suite" panel.
//
// Runs the repo's vitest suite (`npm test` equivalent) as a CHILD PROCESS and
// returns a structured pass/fail report, so an admin can run and diagnose the
// tests from the app UI without remembering CLI commands. Works anywhere the
// test sources + vitest are on disk next to the running server: the dev
// checkout, and the production container (the Dockerfile ships src/,
// vitest.config.ts, vitest.setup.ts and the full node_modules).
//
// Safety: the child process gets DATABASE_URL pointed at an empty throwaway
// guard file in the OS temp dir — NEVER the live database. Suites that need a
// database (the finance integration tests) build their own temp DB via
// `prisma db push` and override DATABASE_URL themselves before importing the
// prisma client, so the guard changes nothing for them; any test that
// accidentally reached for the ambient database would hit an empty schema and
// fail loudly instead of touching real data.

import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

export type TestSuite = 'all' | 'finance'

export interface TestFailure {
  file: string
  test: string
  messages: string[]
}

export interface TestRunResult {
  suite: TestSuite
  startedAt: string
  finishedAt: string
  durationMs: number
  /** true = every test passed */
  success: boolean
  files: number
  tests: { total: number; passed: number; failed: number; skipped: number }
  failures: TestFailure[]
  /** Runner-level failure (spawn/timeout/parse) — distinct from test failures */
  error?: string
}

export interface TestRunnerState {
  available: boolean
  reason?: string
  status: 'idle' | 'running' | 'done'
  suite?: TestSuite
  startedAt?: string
  lastResult?: TestRunResult
}

const RUN_TIMEOUT_MS = 10 * 60 * 1000

// Minimal shape of vitest's JSON reporter output (jest-compatible schema).
interface VitestJsonReport {
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  success: boolean
  testResults: {
    name: string
    status: string
    message?: string
    assertionResults: { fullName: string; status: string; failureMessages: string[] }[]
  }[]
}

// Single-flight run state. One server process (dev and standalone prod), so a
// module-level variable is sufficient — no queue, no history beyond lastResult.
let running: { suite: TestSuite; startedAt: string } | null = null
let lastResult: TestRunResult | undefined

// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

function vitestEntry(): string {
  return join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs')
}

/** Test tooling is present when the vitest config + package sit next to the server. */
export function getTestRunnerAvailability(): { available: boolean; reason?: string } {
  if (existsSync(join(process.cwd(), 'vitest.config.ts')) && existsSync(vitestEntry())) {
    return { available: true }
  }
  return {
    available: false,
    reason:
      'Test files and tooling are not present in this deployment (image built before the test runner ' +
      'was added). Rebuild and redeploy with the current Dockerfile, or run `npm test` in the dev checkout. ' +
      'For live-data checks, use Finance → Admin → Run Integrity Audit.',
  }
}

export function getTestRunnerState(): TestRunnerState {
  const availability = getTestRunnerAvailability()
  return {
    ...availability,
    status: running ? 'running' : lastResult ? 'done' : 'idle',
    suite: running?.suite ?? lastResult?.suite,
    startedAt: running?.startedAt ?? lastResult?.startedAt,
    lastResult: running ? undefined : lastResult,
  }
}

function parseReport(raw: string, suite: TestSuite, startedAt: string): TestRunResult {
  const report = JSON.parse(raw) as VitestJsonReport
  const failures: TestFailure[] = []
  for (const file of report.testResults) {
    const fileLabel = relative(process.cwd(), file.name)
    const failed = file.assertionResults.filter(a => a.status === 'failed')
    for (const a of failed) {
      failures.push({
        file: fileLabel,
        test: a.fullName,
        messages: a.failureMessages.map(m => m.replace(ANSI_RE, '')),
      })
    }
    // File-level failure with no per-test detail (e.g. a collection/import error)
    if (file.status === 'failed' && failed.length === 0) {
      failures.push({
        file: fileLabel,
        test: '(suite failed to load)',
        messages: [file.message?.replace(ANSI_RE, '') ?? 'Unknown collection error'],
      })
    }
  }
  const finishedAt = new Date().toISOString()
  return {
    suite,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    success: report.success && failures.length === 0,
    files: report.testResults.length,
    tests: {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numPendingTests + report.numTodoTests,
    },
    failures,
  }
}

/**
 * Start a test run. Returns false when a run is already in progress.
 * The run completes in the background; poll getTestRunnerState() for the result.
 */
export function startTestRun(suite: TestSuite): boolean {
  if (running) return false
  const startedAt = new Date().toISOString()
  running = { suite, startedAt }

  const workDir = mkdtempSync(join(tmpdir(), 'hb-testrun-'))
  const outFile = join(workDir, 'report.json')
  const guardDb = join(workDir, 'guard.db')

  // Fixed argument list — no user input ever reaches the command line.
  const args = [vitestEntry(), 'run', '--reporter=json', `--outputFile=${outFile}`, '--maxWorkers=2']
  if (suite === 'finance') args.push('finance')

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${guardDb}` },
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000)
  })

  const timeout = setTimeout(() => {
    child.kill()
  }, RUN_TIMEOUT_MS)

  const finish = (result: TestRunResult) => {
    clearTimeout(timeout)
    lastResult = result
    running = null
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      /* temp cleanup is best-effort */
    }
  }

  child.on('error', (err) => {
    finish({
      suite,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - Date.parse(startedAt),
      success: false,
      files: 0,
      tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      failures: [],
      error: `Failed to start test process: ${err.message}`,
    })
  })

  child.on('close', () => {
    // vitest exits non-zero when tests fail but still writes the JSON report —
    // parse the report regardless of exit code and let it tell the story.
    try {
      const raw = readFileSync(outFile, 'utf8')
      finish(parseReport(raw, suite, startedAt))
    } catch {
      finish({
        suite,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt),
        success: false,
        files: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        failures: [],
        error:
          'Test run produced no report (crashed or timed out after 10 minutes). ' +
          `Last output: ${stderrTail.replace(ANSI_RE, '').trim() || '(none)'}`,
      })
    }
  })

  return true
}
