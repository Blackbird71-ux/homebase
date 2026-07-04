import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Unauthenticated Docker healthcheck endpoint. Returns status only —
// no DB path/size, node version, or error details (info disclosure).
async function _GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString() },
      { status: 503 }
    )
  }
}

export const GET = withRouteErrors(_GET)
