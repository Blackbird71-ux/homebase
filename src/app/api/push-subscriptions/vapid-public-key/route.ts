import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'

async function _GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID public key not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in your environment.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ publicKey })
}

export const GET = withRouteErrors(_GET)
