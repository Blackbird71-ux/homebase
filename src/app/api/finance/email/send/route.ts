// src/app/api/finance/email/send/route.ts
// POST — manually send a report email (with optional snapshot persistence)

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { buildYtdReport, getCurrentFY } from '@/lib/financeReport'
import { sendReportEmail } from '@/lib/emailReportService'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'

export async function POST(request: Request) {
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

    const reportYear = year || getCurrentFY()

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
      // Determine current month for snapshot metadata
      const now = new Date()
      const snapshot = await prisma.financeSnapshot.create({
        data: {
          financialYear: reportYear,
          snapshotMonth: now.getMonth() + 1, // 1-12
          snapshotYear: now.getFullYear(),
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[email/send] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
