/**
 * Self-seeded finance integration-test fixture.
 *
 * Builds a throwaway SQLite database from prisma/schema.prisma (`prisma db push`),
 * seeds a minimal family + chart + one posted balanced journal, and binds the
 * prisma singleton to it via DATABASE_URL — so the finance integration suites run
 * on EVERY machine (CI included) WITHOUT the gitignored data/homebase.db, instead
 * of self-skipping into a false green (and instead of breaking post-wipe when the
 * live ledger has zero posted journals).
 *
 * The seeded family id is fixed to FINANCE_TEST_FAMILY so suites keep their
 * existing `const FAMILY = ...` constant. The chart contains only plain, non-control
 * ASSET accounts (no AP/AR control accounts, no income/expense), so:
 *   • the integrity-audit baseline is clean (critical = 0, warning = 0), and
 *   • the suites' hardcoded CONTROL_ACCOUNT_IDS filter passes every seeded account
 *     through as a usable non-control account, and
 *   • the suites' synthetic DR/CR manual entries can debit OR credit any of them
 *     without tripping NORMAL_BALANCE_VIOLATION (which only audits income/expense
 *     accounts for a wrong-side net balance) — so the seeded-account order the
 *     `distinct` discovery returns never matters.
 *
 * Standing rule honoured: this never touches data/homebase.db — it creates its own
 * database from the schema.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Fixed seeded family id — matches the `FAMILY` constant the suites already use. */
export const FINANCE_TEST_FAMILY = 'cmo3yb55h000001ldlk4w6p37'

const REPO = path.resolve(__dirname, '..', '..', '..')

export interface FinanceTestDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any
  tmpDir: string
  familyId: string
  accounts: { assetA: string; assetB: string; assetC: string }
  cleanup: () => Promise<void>
}

/**
 * Create + seed a throwaway finance DB and bind the prisma singleton to it.
 * Call once in a suite's `beforeAll`; call the returned `cleanup` in `afterAll`.
 */
export async function setupFinanceTestDb(prefix = 'hb-fin-'): Promise<FinanceTestDb> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const dbPath = path.join(tmpDir, 'homebase.db')
  const url = `file:${dbPath}`

  // Materialise the schema in the throwaway DB. --accept-data-loss makes it
  // non-interactive against the empty file. DATABASE_URL must be present in env
  // because prisma.config.ts resolves env('DATABASE_URL') at config-load time.
  // Invoke the prisma CLI directly (no shell, no npx): with parallel workers,
  // concurrent npx wrappers race on the shared npx cache and flake; and on
  // failure the prisma output must reach the error, not be swallowed.
  try {
    execFileSync(
      process.execPath,
      [path.join(REPO, 'node_modules', 'prisma', 'build', 'index.js'), 'db', 'push', '--accept-data-loss'],
      {
        cwd: REPO,
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      },
    )
  } catch (e) {
    const err = e as { message?: string; stdout?: Buffer; stderr?: Buffer }
    const output = `${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`.trim()
    throw new Error(`prisma db push failed for the throwaway test DB: ${err.message}\n${output}`)
  }

  // Bind the prisma singleton to the throwaway DB before it is first imported.
  process.env.DATABASE_URL = url
  const { prisma } = await import('../prisma')

  const familyId = FINANCE_TEST_FAMILY
  await prisma.family.create({ data: { id: familyId, name: 'QA Test Family' } })

  const [assetA, assetB, assetC] = await Promise.all([
    prisma.financeCategory.create({ data: { familyId, name: 'QA Bank', type: 'asset' }, select: { id: true } }),
    prisma.financeCategory.create({ data: { familyId, name: 'QA Savings', type: 'asset' }, select: { id: true } }),
    prisma.financeCategory.create({ data: { familyId, name: 'QA Petty Cash', type: 'asset' }, select: { id: true } }),
  ])

  // One posted, balanced manual journal touching all three accounts so the suites'
  // `distinct posted glAccountId` discovery returns three usable non-control
  // accounts and `posted count > 0`. All-asset, no AP/AR control lines ⇒ clean
  // baseline; crediting an asset is not a NORMAL_BALANCE_VIOLATION.
  await prisma.financeJournalEntry.create({
    data: {
      reference: 'JE-0001',
      date: new Date('2026-01-15T00:00:00Z'),
      description: 'QA seed posted journal',
      type: 'manual',
      isPosted: true,
      familyId,
      lines: {
        create: [
          { glAccountId: assetA.id, side: 'debit', amount: 100 },
          { glAccountId: assetB.id, side: 'debit', amount: 60 },
          { glAccountId: assetC.id, side: 'credit', amount: 160 },
        ],
      },
    },
  })

  return {
    prisma,
    tmpDir,
    familyId,
    accounts: { assetA: assetA.id, assetB: assetB.id, assetC: assetC.id },
    cleanup: async () => {
      await prisma?.$disconnect?.()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}
