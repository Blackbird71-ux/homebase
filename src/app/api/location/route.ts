import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getFamilyLocations, recordUserLocation } from '@/lib/location'
import type { SessionUser } from '@/types'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locations = await getFamilyLocations(user.familyId)
  return NextResponse.json(locations)
}

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy)

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const recorded = await recordUserLocation(
    user.id,
    user.familyId,
    lat,
    lng,
    accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
  )
  return NextResponse.json({ recorded })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
