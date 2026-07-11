import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getTestRunnerState, startTestRun, type TestSuite } from '@/lib/test-runner'

// GET  /api/admin/tests — availability + current run state + last result.
//      The admin UI polls this while a run is in progress.
// POST /api/admin/tests — start a test run. Body: { suite?: 'all' | 'finance' }.
//      Returns 409 if a run is already in progress, 400 if tooling is absent
//      (e.g. an image built before the test runner shipped).
//
// Admin only. Uses auth() directly — requireSession uses next/navigation
// redirect() which throws a special error in API routes (QA.md §12.12).

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  return null
}

async function _GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json(getTestRunnerState())
}

async function _POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null) as { suite?: string } | null
  const suite: TestSuite = body?.suite === 'finance' ? 'finance' : 'all'

  const state = getTestRunnerState()
  if (!state.available) {
    return NextResponse.json({ error: state.reason ?? 'Test runner unavailable' }, { status: 400 })
  }

  const started = startTestRun(suite)
  if (!started) {
    return NextResponse.json({ error: 'A test run is already in progress' }, { status: 409 })
  }
  return NextResponse.json(getTestRunnerState(), { status: 202 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
