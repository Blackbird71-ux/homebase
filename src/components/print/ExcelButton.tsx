'use client'

/**
 * ExcelButton — triggers a client-side Excel (.xlsx) download for a report.
 *
 * Usage:
 *   <ExcelButton
 *     buildWorkbook={() => {
 *       const wb = XLSX.utils.book_new()
 *       // ... build sheets ...
 *       return wb
 *     }}
 *     filename="HomeBase - Trial Balance - Jun 2025.xlsx"
 *     disabled={!data || loading}
 *   />
 *
 * The caller is responsible for building the XLSX.WorkBook — this component
 * just handles the button UI, loading state, and download trigger.
 */

import { useState, useCallback } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { downloadWorkbook } from '@/lib/excelStyles'

interface ExcelButtonProps {
  /** Function that builds and returns a XLSX.WorkBook. May be async. */
  buildWorkbook: () => XLSX.WorkBook | Promise<XLSX.WorkBook>
  /** Download filename — should end in .xlsx */
  filename: string
  /** Disable while data is loading */
  disabled?: boolean
  /** Additional Tailwind classes */
  className?: string
}

export function ExcelButton({
  buildWorkbook,
  filename,
  disabled = false,
  className = '',
}: ExcelButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleClick = useCallback(async () => {
    if (busy || disabled) return
    setBusy(true)
    try {
      const wb = await buildWorkbook()
      downloadWorkbook(wb, filename)
    } catch (err) {
      console.error('[ExcelButton] export failed:', err)
    } finally {
      setBusy(false)
    }
  }, [busy, disabled, buildWorkbook, filename])

  return (
    <button
      onClick={handleClick}
      disabled={disabled || busy}
      data-print-hide
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
        'border border-border hover:bg-accent',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'transition-colors print:hidden',
        className,
      ].join(' ')}
      title={`Export to Excel — ${filename}`}
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
      }
      {busy ? 'Building…' : 'Excel'}
    </button>
  )
}
