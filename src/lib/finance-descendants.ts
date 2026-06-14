// src/lib/finance-descendants.ts
// Shared cascade helpers: delete the transitively-spawned, still-open (unpaid /
// unreceived) draft descendants of a recurring bill / income entry.
//
// Used by every path that retires a parent occurrence — undo-payment,
// undo-invoice, and VOID (WI-5 / P3-FC-03 + P4-FC-02) — so a retired parent never
// leaves an actionable successor draft behind. Only no-GL drafts are removed
// (predicate paid:false / received:false); a descendant that has itself been
// paid/received carries posted GL and is left intact for its own explicit void.
//
// Depth-first, delete-after-recursion: deepest descendants are deleted FIRST,
// while their parent links are still intact. The parent FK (parentBillId /
// parentIncomeId) is onDelete: SetNull, so deleting a level before its children
// would null the children's parent link and strand them — this order avoids that.
import { prisma } from '@/lib/prisma'
import type { TxClient } from '@/lib/finance-posting'

/**
 * Recursively delete all unpaid draft descendants of a recurring bill.
 * Pass the surrounding `$transaction` client so the cascade is atomic with the
 * caller's GL reversal / status update.
 */
export async function deleteUnpaidBillDescendants(
  parentId: string,
  familyId: string,
  client: TxClient = prisma,
): Promise<void> {
  const children = await client.financeRecurringBill.findMany({
    where: { parentBillId: parentId, familyId, paid: false },
    select: { id: true },
  })
  for (const child of children) {
    await deleteUnpaidBillDescendants(child.id, familyId, client)
  }
  await client.financeRecurringBill.deleteMany({
    where: { parentBillId: parentId, familyId, paid: false },
  })
}

/**
 * Recursively delete all unreceived draft descendants of an income entry.
 */
export async function deleteUnreceivedIncomeDescendants(
  parentId: string,
  familyId: string,
  client: TxClient = prisma,
): Promise<void> {
  const children = await client.financeIncomeEntry.findMany({
    where: { parentIncomeId: parentId, familyId, received: false },
    select: { id: true },
  })
  for (const child of children) {
    await deleteUnreceivedIncomeDescendants(child.id, familyId, client)
  }
  await client.financeIncomeEntry.deleteMany({
    where: { parentIncomeId: parentId, familyId, received: false },
  })
}
