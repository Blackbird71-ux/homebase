// Australian income tax calculator — 2025-26 ATO rates.
// Update bracket thresholds here each July; no API redeployment needed.

export function calcIncomeTax(income: number): number {
  if (income <= 0)       return 0
  if (income <= 18_200)  return 0
  if (income <= 45_000)  return (income - 18_200) * 0.16
  if (income <= 135_000) return 4_288 + (income - 45_000) * 0.30
  if (income <= 190_000) return 31_288 + (income - 135_000) * 0.37
  return 51_638 + (income - 190_000) * 0.45
}

export function calcMedicare(income: number): number {
  if (income <= 26_000) return 0
  return income * 0.02
}

export function calcPersonalTax(taxableIncome: number): { incomeTax: number; medicare: number; total: number } {
  const incomeTax = Math.round(calcIncomeTax(taxableIncome))
  const medicare  = Math.round(calcMedicare(taxableIncome))
  return { incomeTax, medicare, total: incomeTax + medicare }
}

/** Concessional contributions cap by financial year. Add the new FY entry each July. */
export const SUPER_CAP: Record<string, number> = {
  '2022-23': 27_500,
  '2023-24': 27_500,
  '2024-25': 30_000,
  '2025-26': 30_000,
  '2026-27': 30_000,
}
