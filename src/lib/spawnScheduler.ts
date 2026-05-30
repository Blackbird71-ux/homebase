// src/lib/spawnScheduler.ts
// Singleton cron scheduler for recurring-template draft spawning.
// Mirrors reportScheduler.ts: own init guard, own instrumentation.ts line,
// prisma.family.findMany() loop so it handles multiple families without
// code changes when family #2 appears.

import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { spawnDueDrafts } from '@/lib/finance-draft-spawn-service'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import type { SessionUser } from '@/types'

declare global {
  // eslint-disable-next-line no-var
  var __spawnSchedulerInitialized: boolean | undefined
}

/**
 * Start the daily draft-spawn cron scheduler.
 *
 * Runs at 06:00 Australia/Brisbane by default. Override with the
 * SPAWN_CRON_SCHEDULE env var (standard cron syntax, 5 fields).
 *
 * For each family the worker:
 *   1. Constructs a system pseudo-user for audit log attribution.
 *   2. Calls spawnDueDrafts — idempotent, safe to run multiple times.
 *   3. Logs a one-line summary per family.
 *
 * One family failing does not abort the others.
 */
export function startSpawnScheduler(): void {
  if (global.__spawnSchedulerInitialized) return
  global.__spawnSchedulerInitialized = true

  const schedule = process.env.SPAWN_CRON_SCHEDULE ?? '0 6 * * *'

  if (!cron.validate(schedule)) {
    console.warn(`[spawnScheduler] Invalid cron schedule "${schedule}" — spawn scheduler disabled`)
    return
  }

  cron.schedule(
    schedule,
    async () => {
      console.log('[spawnScheduler] Running daily draft spawn...')

      try {
        const families = await prisma.family.findMany({
          select: { id: true, timezone: true },
        })

        if (families.length === 0) {
          console.log('[spawnScheduler] No families found — nothing to spawn')
          return
        }

        const asOf = new Date()

        for (const family of families) {
          try {
            // System pseudo-user: AuditLog.userId is a plain String (no FK),
            // so 'system' is a valid value. The family's timezone is preserved
            // for any downstream date logic inside the spawn worker.
            const systemUser: SessionUser = {
              id: 'system',
              name: 'System (scheduler)',
              email: '',
              role: 'admin',
              familyId: family.id,
              timezone: family.timezone ?? DEFAULT_TIMEZONE,
              weekStartsOn: 1,
            }

            const report = await spawnDueDrafts(systemUser, family.id, asOf)

            const disabled = report.results.filter(r => r.disabledDueToMissingGlAccount).length
            console.log(
              `[spawnScheduler] family=${family.id} ` +
              `considered=${report.templatesConsidered} ` +
              `spawned=${report.totalSpawned} ` +
              `disabled=${disabled}`,
            )

            if (disabled > 0) {
              const names = report.results
                .filter(r => r.disabledDueToMissingGlAccount)
                .map(r => `"${r.templateName}"`)
                .join(', ')
              console.warn(
                `[spawnScheduler] family=${family.id} auto-disabled ${disabled} template(s) ` +
                `due to missing GL accounts: ${names}`,
              )
            }
          } catch (err) {
            console.error(`[spawnScheduler] Error processing family ${family.id}:`, err)
          }
        }

        console.log('[spawnScheduler] Daily draft spawn complete')
      } catch (err) {
        console.error('[spawnScheduler] Fatal error:', err)
      }
    },
    { timezone: 'Australia/Brisbane' }
  )

  console.log(`[spawnScheduler] Draft spawn cron scheduled: ${schedule} (Australia/Brisbane)`)
}
