/**
 * finance-categories.ts
 *
 * Shared sort helper for finance category dropdowns used across
 * income, bills, transactions, and vendors pages.
 *
 * Sorts: parents alphabetically, then each parent's children alphabetically
 * immediately below it — matching a standard "grouped" dropdown layout.
 */

export interface FlatCategory {
  id: string
  name: string
  type: string           // 'income' | 'expense' | 'transfer'
  parentId: string | null
  color?: string | null
  level?: number
}

/**
 * Returns a flat list sorted so that:
 *   - Root categories appear alphabetically
 *   - Each root's children appear directly after it, also alphabetically
 *
 * Pass the full unfiltered list; filtering by type is done by the caller
 * before or after (or pass a pre-filtered list).
 */
export function sortedCategoryList(cats: FlatCategory[]): FlatCategory[] {
  const roots = cats
    .filter(c => !c.parentId)
    .sort((a, b) => {
      const aArchive = a.name === 'NOT IN USE'
      const bArchive = b.name === 'NOT IN USE'
      if (aArchive !== bArchive) return aArchive ? 1 : -1
      return a.name.localeCompare(b.name)
    })

  const childMap = new Map<string, FlatCategory[]>()
  for (const c of cats) {
    if (c.parentId) {
      const arr = childMap.get(c.parentId) ?? []
      arr.push(c)
      childMap.set(c.parentId, arr)
    }
  }

  const result: FlatCategory[] = []
  for (const root of roots) {
    result.push(root)
    const children = (childMap.get(root.id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
    result.push(...children)
  }
  return result
}

/**
 * Derive the bill/income "Tax Classification" value from a category's tax flags.
 *
 * Mirrors the two non-empty options the editors offer:
 *   'tax_payment'   → "Tax Payment (PAYG)"
 *   'tax_deduction' → "Tax Deduction"
 * Returns '' ("Not classified") when neither flag is set or no category is given.
 *
 * Assumption: the two flags are mutually exclusive in practice; if both are
 * somehow set, PAYG payment takes precedence over deduction.
 */
export function deriveTaxClassification(
  category: { isTaxPayment?: boolean | null; isTaxDeduction?: boolean | null } | null | undefined,
): '' | 'tax_payment' | 'tax_deduction' {
  if (!category) return ''
  if (category.isTaxPayment) return 'tax_payment'
  if (category.isTaxDeduction) return 'tax_deduction'
  return ''
}
