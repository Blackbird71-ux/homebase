import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { id: true, name: true, timezone: true, umamiScriptUrl: true, umamiSiteId: true, loginTagline: true, appVersion: true, financeYearStartMonth: true, periodLockedUntil: true, hideFinanceModule: true },
  })
  if (!family) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(family)
}

export async function PATCH(req: Request) {
  const user = await requireAdmin()
  const body = await req.json()
  const { timezone, name, umamiScriptUrl, umamiSiteId, loginTagline, appVersion, financeYearStartMonth, periodLockedUntil, hideFinanceModule } = body

  if (timezone !== undefined && !SUPPORTED_TIMEZONES.includes(timezone)) {
    return NextResponse.json({ error: 'Unsupported timezone' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (timezone !== undefined) updateData.timezone = timezone
  if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
    updateData.name = name.trim()
  }
  if (umamiScriptUrl !== undefined) updateData.umamiScriptUrl = umamiScriptUrl === '' ? null : umamiScriptUrl
  if (umamiSiteId !== undefined) updateData.umamiSiteId = umamiSiteId === '' ? null : umamiSiteId
  if (loginTagline !== undefined) {
    updateData.loginTagline = loginTagline === '' ? null : String(loginTagline).slice(0, 200)
  }
  if (appVersion !== undefined) {
    updateData.appVersion = appVersion === '' ? null : String(appVersion).slice(0, 20)
  }

  if (financeYearStartMonth !== undefined) {
    const m = parseInt(financeYearStartMonth, 10)
    if (isNaN(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: 'financeYearStartMonth must be 1–12' }, { status: 400 })
    }
    updateData.financeYearStartMonth = m
  }

  if (periodLockedUntil !== undefined) {
    updateData.periodLockedUntil = periodLockedUntil ? new Date(periodLockedUntil) : null
  }

  if (hideFinanceModule !== undefined) {
    updateData.hideFinanceModule = !!hideFinanceModule
  }

  const updated = await prisma.family.update({
    where: { id: user.familyId },
    data: updateData,
    select: { id: true, name: true, timezone: true, umamiScriptUrl: true, umamiSiteId: true, loginTagline: true, appVersion: true, financeYearStartMonth: true, periodLockedUntil: true, hideFinanceModule: true },
  })
  return NextResponse.json(updated)
}
