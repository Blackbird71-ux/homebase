// BAS (Australian GST activity statement) figure derivation.
//
// Kept here, not inline in the route, so the GST arithmetic is unit-tested and
// has a single source of truth (AGENTS.md — accounting logic belongs in src/lib).
//
// THE INVARIANT THIS FILE PROTECTS: BAS must agree with the P&L, Trial Balance,
// and Balance Sheet, all of which are GL-sourced and net both debit and credit
// sides of every account. A reversal posts FLIPPED lines (debit↔credit) as a new
// posted entry; a contra line lands on the opposite side. Summing only one side
// (e.g. only credits on "GST Collected") silently ignores reversals and overstates
// the figure. Every BAS contribution below therefore nets both sides.

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Signed contribution of a "GST Collected" line to 1A (GST on sales).
 * Natural side is credit (a sale credits GST Collected); a reversal debits it.
 *   credit → +amount   debit → −amount
 */
export function gstCollectedContribution(side: string, amount: number): number {
  return side === 'credit' ? amount : -amount
}

/**
 * Signed contribution of a "GST Input Tax Credits" line to 1B (GST on purchases).
 * Natural side is debit (a purchase debits GST ITC); a reversal credits it.
 *   debit → +amount   credit → −amount
 */
export function gstItcContribution(side: string, amount: number): number {
  return side === 'debit' ? amount : -amount
}

/**
 * Signed contribution of an income GL line to net income (feeds G1).
 * Income is naturally a credit; a reversal/contra debits the income account.
 *   credit → +amount   debit → −amount
 * Mirrors the P&L income netting in src/app/api/finance/pnl/route.ts.
 */
export function incomeContribution(side: string, amount: number): number {
  return side === 'credit' ? amount : -amount
}

export interface BasGstLineInput {
  glAccountId: string
  side:        string   // 'debit' | 'credit'
  amount:      number
}

export interface BasIncomeLineInput {
  side:   string        // 'debit' | 'credit'
  amount: number
}

export interface BasFigures {
  g1:     number        // G1  — total sales (inc GST) = net income + 1A
  oneA:   number        // 1A  — GST collected on sales (net of reversals)
  oneB:   number        // 1B  — GST input tax credits  (net of reversals)
  netGst: number        // Net — 1A − 1B (positive = payable to ATO)
}

/**
 * Compute the four BAS summary figures from posted GST and income journal lines.
 * Both sides of every line are netted — reversal and contra lines reduce the
 * figure exactly as they do on the P&L, so the statement reconciles to the GL.
 */
export function computeBasFigures(
  gstLines:           BasGstLineInput[],
  incomeLines:        BasIncomeLineInput[],
  gstCollectedAcctId: string,
  gstItcAcctId:       string,
): BasFigures {
  let oneA = 0
  let oneB = 0
  for (const l of gstLines) {
    if (l.glAccountId === gstCollectedAcctId)      oneA += gstCollectedContribution(l.side, l.amount)
    else if (l.glAccountId === gstItcAcctId)       oneB += gstItcContribution(l.side, l.amount)
  }
  oneA = r2(oneA)
  oneB = r2(oneB)

  const netIncome = incomeLines.reduce((s, l) => s + incomeContribution(l.side, l.amount), 0)

  return {
    oneA,
    oneB,
    g1:     r2(netIncome + oneA),
    netGst: r2(oneA - oneB),
  }
}
