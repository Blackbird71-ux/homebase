import type { FormLine, GLAccount, JournalForm } from './journal-types'
import { fmt } from './journal-types'

/** Sum debit and credit sides of a set of journal form lines. */
export function getLineTotals(lines: FormLine[]): { debitTotal: number; creditTotal: number; difference: number } {
  let debitTotal = 0, creditTotal = 0
  for (const line of lines) {
    const amt = parseFloat(line.amount) || 0
    if (line.side === 'debit') debitTotal += amt
    else creditTotal += amt
  }
  return {
    debitTotal:  Math.round(debitTotal  * 100) / 100,
    creditTotal: Math.round(creditTotal * 100) / 100,
    difference:  Math.round(Math.abs(debitTotal - creditTotal) * 100) / 100,
  }
}

/** Validate a journal entry form. Returns an error map; empty map means valid. */
export function validateJournalEntry(form: JournalForm): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!form.date)               errs.date        = 'Date is required'
  if (!form.description.trim()) errs.description = 'Description is required'
  if (form.lines.length < 2)   errs.lines       = 'At least 2 lines are required'
  for (let i = 0; i < form.lines.length; i++) {
    const line = form.lines[i]
    if (!line.glAccountId) errs[`line_${i}_account`] = 'Select a GL account'
    const amt = parseFloat(line.amount)
    if (!line.amount || isNaN(amt) || amt <= 0) errs[`line_${i}_amount`] = 'Enter amount > 0'
  }
  const { difference } = getLineTotals(form.lines)
  if (difference > 0.005) errs.balance = `Debits must equal credits. Difference: ${fmt(difference)}`
  return errs
}

/**
 * Sort GL accounts into the canonical chart-of-accounts order:
 * asset → liability → equity → income → expense, roots first then children.
 */
export function sortedGlAccounts(glAccounts: GLAccount[]): GLAccount[] {
  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
  const result: GLAccount[] = []
  for (const type of typeOrder) {
    const roots    = glAccounts.filter(a => a.type === type && !a.parentId).sort((a, b) => a.name.localeCompare(b.name))
    const children = glAccounts.filter(a => a.type === type &&  a.parentId).sort((a, b) => a.name.localeCompare(b.name))
    for (const root of roots) { result.push(root); result.push(...children.filter(c => c.parentId === root.id)) }
  }
  return result
}

/** Format a GL account for display in a picker option. */
export function glAccountLabel(acct: GLAccount): string {
  return `${acct.parentId ? '— ' : ''}${acct.glCode ? `[${acct.glCode}] ` : ''}${acct.name} (${acct.type})`
}
