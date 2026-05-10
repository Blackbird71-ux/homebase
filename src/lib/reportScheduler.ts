// src/lib/reportScheduler.ts
// Singleton cron scheduler for monthly report generation and emailing

import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { buildYtdReport, getCurrentFY } from '@/lib/financeReport'
import { sendReportEmail } from '@/lib/emailReportService'

declare global {
  // eslint-disable-next-line no-var
  var __reportSchedulerInitialized: boolean | undefined
}

/**
 * Start the monthly report cron scheduler.
 * Runs on the 1st of every month at 00:05 (Australia/Brisbane time).
 * Only runs if REPORT_EMAIL_RECIPIENTS env var is set.
 */
export function startReportScheduler(): void {
  if (global.__reportSchedulerInitialized) return
  global.__reportSchedulerInitialized = true

  const recipientsRaw = process.env.REPORT_EMAIL_RECIPIENTS
  if (!recipientsRaw) {
    console.log('[reportScheduler] REPORT_EMAIL_RECIPIENTS not set — report scheduler disabled')
    return
  }

  const recipients = recipientsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (recipients.length === 0) {
    console.log('[reportScheduler] No valid recipients in REPORT_EMAIL_RECIPIENTS — scheduler disabled')
    return
  }

  const schedule = '5 0 1 * *' // 1st of each month at 00:05

  if (!cron.validate(schedule)) {
    console.warn('[reportScheduler] Invalid cron schedule — aborting')
    return
  }

  cron.schedule(
    schedule,
    async () => {
      console.log('[reportScheduler] Running monthly report generation...')

      try {
        const year = getCurrentFY()
        const now = new Date()

        // Find all families that have finance data
        const families = await prisma.family.findMany({
          where: {
            financeIncomeEntries: { some: {} },
          },
          select: { id: true },
        })

        if (families.length === 0) {
          console.log('[reportScheduler] No families with finance data found')
          return
        }

        for (const family of families) {
          try {
            // Check if a snapshot already exists for this period
            const existing = await prisma.financeSnapshot.findFirst({
              where: {
                familyId: family.id,
                financialYear: year,
                snapshotMonth: now.getMonth() + 1,
                snapshotYear: now.getFullYear(),
              },
            })

            if (existing) {
              console.log(`[reportScheduler] Snapshot already exists for family ${family.id}, ${year} month ${now.getMonth() + 1} — skipping`)
              continue
            }

            // Build report
            const report = await buildYtdReport(family.id, year)

            // Save snapshot
            const snapshot = await prisma.financeSnapshot.create({
              data: {
                financialYear: year,
                snapshotMonth: now.getMonth() + 1,
                snapshotYear: now.getFullYear(),
                periodLabel: report.meta.periodLabel,
                monthsComplete: report.meta.monthsComplete,
                reportJson: JSON.stringify(report),
                familyId: family.id,
              },
            })

            // Send email notification
            const emailResult = await sendReportEmail({
              familyId: family.id,
              year,
              recipients,
              snapshotId: snapshot.id,
            })

            if (emailResult.success) {
              // Mark all ReportEmail records for this snapshot as sent
              await prisma.reportEmail.updateMany({
                where: { snapshotId: snapshot.id },
                data: { status: 'sent', sentAt: new Date() },
              })
              console.log(`[reportScheduler] Report sent for family ${family.id} to ${recipients.length} recipient(s)`)
            } else {
              console.error(`[reportScheduler] Email failed for family ${family.id}: ${emailResult.error}`)
              await prisma.reportEmail.updateMany({
                where: { snapshotId: snapshot.id },
                data: { status: 'failed', errorMessage: emailResult.error },
              })
            }
          } catch (err) {
            console.error(`[reportScheduler] Error processing family ${family.id}:`, err)
          }
        }

        console.log('[reportScheduler] Monthly report run complete')
      } catch (err) {
        console.error('[reportScheduler] Fatal error:', err)
      }
    },
    { timezone: 'Australia/Brisbane' }
  )

  console.log(`[reportScheduler] Monthly report cron scheduled: ${schedule} (Australia/Brisbane)`)
  console.log(`[reportScheduler] Recipients: ${recipients.join(', ')}`)
}
