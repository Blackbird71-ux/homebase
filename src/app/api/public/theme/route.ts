import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function _GET() {
  try {
    const user = await prisma.user.findFirst({ select: { theme: true } })
    return NextResponse.json({ theme: user?.theme ?? 'dark' })
  } catch {
    return NextResponse.json({ theme: 'dark' })
  }
}

export const GET = withRouteErrors(_GET)
