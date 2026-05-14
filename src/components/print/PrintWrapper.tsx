'use client'

/**
 * PrintWrapper — wraps report content with a printable header.
 *
 * Usage:
 *   const printRef = useRef<HTMLDivElement>(null)
 *
 *   <PrintWrapper
 *     ref={printRef}
 *     reportTitle="Trial Balance"
 *     dateRange="1 Jul 2024 – 30 Jun 2025"
 *   >
 *     {…report JSX…}
 *   </PrintWrapper>
 *
 * The print header is hidden on-screen (print:block) and visible only in print.
 * The wrapper div is what you pass to PrintButton's printRef.
 */

import { forwardRef } from 'react'
import { format } from 'date-fns'

interface PrintWrapperProps {
  /** The report name shown in the print header */
  reportTitle: string
  /** Optional sub-title / date range shown below the report name */
  dateRange?: string
  /** Optional extra metadata line (e.g. entity name, balance status) */
  meta?: string
  children: React.ReactNode
}

export const PrintWrapper = forwardRef<HTMLDivElement, PrintWrapperProps>(
  function PrintWrapper({ reportTitle, dateRange, meta, children }, ref) {
    const generatedAt = format(new Date(), 'd MMM yyyy, h:mm a')

    return (
      <div ref={ref}>
        {/* ── Print-only header ─────────────────────────────────────────── */}
        {/* Hidden on screen via "hidden"; PrintButton makes it visible in the print window */}
        <div className="print-header hidden" aria-hidden="true">
          <div>
            <div className="print-header-title">{reportTitle}</div>
            {dateRange && (
              <div style={{ fontSize: '9pt', color: '#555', marginTop: 2 }}>{dateRange}</div>
            )}
            {meta && (
              <div style={{ fontSize: '8pt', color: '#777', marginTop: 2 }}>{meta}</div>
            )}
          </div>
          <div className="print-header-meta">
            <div style={{ fontWeight: 700 }}>HomeBase</div>
            <div>Generated: {generatedAt}</div>
          </div>
        </div>

        {/* ── Report content ────────────────────────────────────────────── */}
        {children}
      </div>
    )
  }
)
