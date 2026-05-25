// src/app/api/finance/export/print/route.ts
// Self-contained HTML page suitable for printing — no external CSS/JS

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { buildYtdReport, getCurrentFY } from '@/lib/financeReport'

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const familyId = user.familyId
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') ?? 'budget'
    const year = searchParams.get('year') ?? getCurrentFY()

    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { financeYearStartMonth: true, timezone: true },
    })
    const fyStartMonth = family?.financeYearStartMonth ?? 7
    const tz = family?.timezone ?? 'Australia/Sydney'

    const report = await buildYtdReport(familyId, year, fyStartMonth, tz)

    function monthTable(label: string, rows: { label: string; monthly: number[]; total: number }[], subtotal: number) {
      return `
        <table>
          <thead>
            <tr><th>${label}</th>${report.meta.months.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.label}</td>
                ${r.monthly.map(v => `<td class="num">${v ? fmt(v) : '-'}</td>`).join('')}
                <td class="num total">${fmt(r.total)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal">
              <td>Subtotal</td>
              ${report.meta.months.map(() => '<td></td>').join('')}
              <td class="num">${fmt(subtotal)}</td>
            </tr>
          </tbody>
        </table>`
    }

    // Build Income section
    let incomeHtml = ''
    for (const section of report.sections) {
      if (section.income.rows.length === 0) continue
      incomeHtml += `<h2>${section.name}</h2>`
      incomeHtml += monthTable('Income', section.income.rows, section.income.subtotal)
    }

    // Build Expenses section
    let expenseHtml = ''
    for (const section of report.sections) {
      if (section.expenses.categories.length === 0) continue
      expenseHtml += `<h2>${section.name}</h2>`
      for (const cat of section.expenses.categories) {
        expenseHtml += `<h3>${cat.name}</h3>`
        expenseHtml += monthTable('Expense', cat.rows, cat.subtotal)
      }
      expenseHtml += `<p class="section-total"><strong>Total Expenses: ${fmt(section.expenses.subtotal)}</strong></p>`
    }

    // Build NETT section
    let nettHtml = `
      <table>
        <thead>
          <tr><th>Entity</th>${report.meta.months.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr>
        </thead>
        <tbody>
          ${report.sections.map(sec => {
            const monthlyVals = report.meta.months.map((_, i) => {
              const inc = sec.income.rows.reduce((s, r) => s + (r.monthly[i] || 0), 0)
              const exp = sec.expenses.categories.reduce((s, c) => s + (c.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)), 0)
              return inc - exp
            })
            return `<tr>
              <td>${sec.name}</td>
              ${monthlyVals.map(v => `<td class="num ${v >= 0 ? 'pos' : 'neg'}">${fmt(v)}</td>`).join('')}
              <td class="num total ${sec.nett >= 0 ? 'pos' : 'neg'}">${fmt(sec.nett)}</td>
            </tr>`
          }).join('')}
          <tr class="grand-total">
            <td>Total NETT</td>
            ${report.meta.months.map((_, i) => {
              const total = report.sections.reduce((s, sec) => {
                const inc = sec.income.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)
                const exp = sec.expenses.categories.reduce((sr, c) => sr + (c.rows.reduce((scr, r) => scr + (r.monthly[i] || 0), 0)), 0)
                return s + inc - exp
              }, 0)
              return `<td class="num ${total >= 0 ? 'pos' : 'neg'}">${fmt(total)}</td>`
            }).join('')}
            <td class="num ${report.totals.totalNett >= 0 ? 'pos' : 'neg'}">${fmt(report.totals.totalNett)}</td>
          </tr>
        </tbody>
      </table>`

    // Build Tax section (only in tax mode)
    let taxHtml = ''
    if (mode === 'tax' && report.tax) {
      for (const m of report.tax.byMember) {
        const refundOrOwing = -(m.estimatedTaxPayable - m.paygWithheld - m.taxPayments)
        taxHtml += `
          <div class="page-break">
            <h2>Tax Summary — ${m.memberName}</h2>
            <table>
              <tbody>
                <tr><td>Wages</td><td class="num">${fmt(m.taxableIncome)}</td></tr>
                <tr><td>Bank Interest</td><td class="num">$0.00</td></tr>
                <tr><td>Other Income</td><td class="num">$0.00</td></tr>
                <tr class="total"><td>Total Income</td><td class="num">${fmt(m.taxableIncome)}</td></tr>
                <tr><td colspan="2"></td></tr>
                <tr><td>Super Contributions (SGC)</td><td class="num">${fmt(m.sgcEmployer)}</td></tr>
                <tr><td>Other Deductions</td><td class="num">${fmt(m.deductions)}</td></tr>
                <tr class="total"><td>Total Deductions</td><td class="num">${fmt(m.sgcEmployer + m.deductions)}</td></tr>
                <tr><td colspan="2"></td></tr>
                <tr class="total"><td>Total Taxable</td><td class="num">${fmt(m.totalTaxable)}</td></tr>
                <tr><td>Tax Payable</td><td class="num">${fmt(m.estimatedTaxPayable)}</td></tr>
                <tr><td>PAYG Withheld</td><td class="num">${fmt(m.paygWithheld)}</td></tr>
                <tr><td>PAYG Instalments</td><td class="num">${fmt(m.taxPayments)}</td></tr>
                <tr><td>Tax Credit for Divs</td><td class="num">${fmt(m.taxCreditForDivs)}</td></tr>
                <tr class="grand-total"><td>NET REFUND / (OWING)</td><td class="num ${refundOrOwing >= 0 ? 'pos' : 'neg'}">${fmt(refundOrOwing)}</td></tr>
              </tbody>
            </table>
          </div>`
      }
      taxHtml += `<p class="disclaimer"><em>Estimated only — based on ATO tax brackets. Consult your accountant.</em></p>`
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Homebase Finance Report — ${report.meta.periodLabel}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 15mm; }
  h1 { font-size: 16pt; margin-bottom: 4px; }
  h2 { font-size: 13pt; margin-top: 20px; margin-bottom: 8px; color: #2E75B6; page-break-before: always; }
  h2:first-of-type { page-break-before: avoid; }
  h3 { font-size: 11pt; margin-top: 12px; margin-bottom: 6px; color: #555; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #D9D9D9; font-weight: bold; text-align: center; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.total { font-weight: bold; }
  tr.subtotal td { font-style: italic; color: #2E75B6; background: #DEEAF1; font-weight: bold; }
  tr.grand-total td { font-weight: bold; background: #BDD7EE; }
  tr.total td { font-weight: bold; }
  .pos { color: #375623; }
  .neg { color: #C00000; }
  .section-total { text-align: right; font-size: 10pt; margin-top: -8px; margin-bottom: 16px; }
  .page-break { page-break-before: always; }
  .disclaimer { font-size: 8pt; color: #888; margin-top: 20px; }
  .print-button {
    position: fixed; top: 20px; right: 20px; z-index: 1000;
    padding: 10px 20px; background: #2E75B6; color: #fff; border: none; border-radius: 6px;
    font-size: 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .print-button:hover { background: #1a5a8c; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 8px; }
  @media print {
    .print-button { display: none; }
    body { padding: 0; }
    h2 { page-break-before: always; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>
  <button class="print-button" onclick="window.print()">🖨️ Print</button>

  <h1>Homebase Finance Report</h1>
  <p>${report.meta.periodLabel} (${report.meta.financialYear})</p>
  <p>Generated: ${new Date(report.meta.generatedAt).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>Months covered: ${report.meta.monthsComplete} of 12</p>

  <h2>Income</h2>
  ${incomeHtml}
  <p class="section-total"><strong>Total Income: ${fmt(report.totals.totalIncome)}</strong></p>

  <h2>Expenses</h2>
  ${expenseHtml}
  <p class="section-total"><strong>Total Expenses: ${fmt(report.totals.totalExpenses)}</strong></p>

  <h2>NETT</h2>
  ${nettHtml}

  ${taxHtml}

  <div class="footer">Homebase Family Finance — Confidential</div>
</body>
</html>`

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (err) {
    console.error('[export/print]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
