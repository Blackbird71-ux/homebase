import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// Common IANA timezone list for the selector
export const SUPPORTED_TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'UTC',
] as const

export type SupportedTimezone = (typeof SUPPORTED_TIMEZONES)[number]

export async function GET() {
  const user = await requireSession()
  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { id: true, name: true, timezone: true, umamiScriptUrl: true, umamiSiteId: true },
  })
  if (!family) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(family)
}

export async function PATCH(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { timezone, name, umamiScriptUrl, umamiSiteId } = body

  if (timezone !== undefined && !SUPPORTED_TIMEZONES.includes(timezone)) {
    return NextResponse.json({ error: 'Unsupported timezone' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (timezone !== undefined) updateData.timezone = timezone
  if (name !== undefined) updateData.name = name
  if (umamiScriptUrl !== undefined) updateData.umamiScriptUrl = umamiScriptUrl === '' ? null : umamiScriptUrl
  if (umamiSiteId !== undefined) updateData.umamiSiteId = umamiSiteId === '' ? null : umamiSiteId

  const updated = await prisma.family.update({
    where: { id: user.familyId },
    data: updateData,
    select: { id: true, name: true, timezone: true, umamiScriptUrl: true, umamiSiteId: true },
  })
  return NextResponse.json(updated)
}
