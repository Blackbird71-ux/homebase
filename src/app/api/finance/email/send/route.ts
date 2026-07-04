// src/app/api/finance/email/send/route.ts
// POST — manually send a report email (with optional snapshot persistence)

import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { buildYtdReport } from '@/lib/financeReport'
import { currentFyContextInTz, fyLabel } from '@/lib/finance-fy'
import { sendReportEmail } from '@/lib/emailReportService'
import { DEFAULT_TIMEZONE, todayStringInTz } from '@/lib/timezone'

async function _POST(request: Request) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Load FY start month from family settings
    const family = await prisma.family.findUnique({
      where: { id: user.familyId },
      select: { financeYearStartMonth: true, timezone: true },
    })
    const fyStartMonth = family?.financeYearStartMonth ?? 7
    const timezone = family?.timezone ?? DEFAULT_TIMEZONE

    const body = await request.json()
    const {
      year,
      snapshotId,
      recipients,
      note,
    }: {
      year?: string
      snapshotId?: string
      recipients: string[]
      note?: string
    } = body

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
    }

    // Default FY label is computed from "now" in the family tz (not server-UTC),
    // so an east-of-UTC family isn't emailed the prior FY within the offset after
    // a local FY rollover (P9-FC-01/-02).
    const reportYear = year || fyLabel(currentFyContextInTz(fyStartMonth, timezone).fyYear, fyStartMonth)

    // If snapshotId provided, ensure it exists and belongs to this family
    if (snapshotId) {
      const snapshot = await prisma.financeSnapshot.findFirst({
        where: { id: snapshotId, familyId: user.familyId },
      })
      if (!snapshot) {
        return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
      }
    }

    // Build the report (or could load from snapshot JSON, but we rebuild for freshness)
    const report = await buildYtdReport(user.familyId, reportYear, fyStartMonth, timezone)

    // Save snapshot if not using an existing one
    let actualSnapshotId = snapshotId
    if (!actualSnapshotId) {
      // Determine current month for snapshot metadata (P9-A1).
      // Stamp the capture-month label in the family tz, not server-UTC — the
      // report body is already tz-correct, so a run in the post-midnight UTC
      // window near a month boundary must not mislabel the capture month.
      const todayLocal = todayStringInTz(timezone) // 'YYYY-MM-DD' in family tz
      const snapshotYearLocal = Number(todayLocal.slice(0, 4))
      const snapshotMonthLocal = Number(todayLocal.slice(5, 7)) // 1-12
      const snapshot = await prisma.financeSnapshot.create({
        data: {
          financialYear: reportYear,
          snapshotMonth: snapshotMonthLocal,
          snapshotYear: snapshotYearLocal,
          periodLabel: report.meta.periodLabel,
          monthsComplete: report.meta.monthsComplete,
          reportJson: JSON.stringify(report),
          familyId: user.familyId,
        },
      })
      actualSnapshotId = snapshot.id
    }

    // Create ReportEmail records
    const emailRecords = await Promise.all(
      recipients.map((email) =>
        prisma.reportEmail.create({
          data: {
            snapshotId: actualSnapshotId!,
            recipientEmail: email,
            subject: `Homebase Finance — YTD ${report.meta.periodLabel} (${report.meta.financialYear})`,
            status: 'pending',
          },
        })
      )
    )

    // Send the email
    const result = await sendReportEmail({
      familyId: user.familyId,
      year: reportYear,
      recipients,
      note,
      snapshotId: actualSnapshotId,
      fyStartMonth,
      tz: timezone,
    })

    if (!result.success) {
      // Mark email records as failed
      await prisma.reportEmail.updateMany({
        where: { id: { in: emailRecords.map((r) => r.id) } },
        data: { status: 'failed', errorMessage: result.error, sentAt: new Date() },
      })
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Mark email records as sent
    await prisma.reportEmail.updateMany({
      where: { id: { in: emailRecords.map((r) => r.id) } },
      data: { status: 'sent', sentAt: new Date() },
    })

    return NextResponse.json({
      ok: true,
      snapshotId: actualSnapshotId,
      recipients: recipients.length,
    })
  } catch (err) {
    // P11-A1: log server-side, never return the raw error to the client.
    console.error('[email/send] Error:', err instanceof Error ? err.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const POST = withRouteErrors(_POST)
