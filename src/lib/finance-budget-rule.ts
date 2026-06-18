import type { TxClient } from '@/lib/finance-posting'

/**
 * Remove the "from bill" Budget Planner rule(s) linked to a bill.
 *
 * A FinanceBudget rule with billId set is created by the budget route's
 * `upsertFromBill` PATCH when a bill is flagged "include in budget". That rule
 * must be removed whenever the bill leaves the active set — deleted, voided, or
 * cancelled — otherwise it lingers as a phantom "expected cost" in the Budget
 * Planner and Budget Overview (the bill's billId is SET NULL on hard-delete, so
 * the orphan can no longer be identified by read-time filtering — it must be
 * cleaned up at the point the bill is removed).
 *
 * Single source of truth for this cleanup; callers in the bill DELETE/VOID/
 * cancel paths and the budget route's `removeFromBill` branch all use it.
 *
 * IMPORTANT: on a hard DELETE, call this BEFORE deleting the bill row — once the
 * bill is gone the FK SET NULL has already cleared billId and this finds nothing.
 *
 * Safe no-op when the bill has no rule. Returns the number of rules removed.
 */
export async function removeBillBudgetRule(
  client: TxClient,
  billId: string,
  familyId: string,
): Promise<number> {
  const { count } = await client.financeBudget.deleteMany({ where: { billId, familyId } })
  return count
}
