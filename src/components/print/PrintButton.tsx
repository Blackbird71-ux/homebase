'use client'

/**
 * PrintButton — triggers browser print / Save as PDF for a report.
 *
 * Usage:
 *   const printRef = useRef<HTMLDivElement>(null)
 *   <PrintButton printRef={printRef} reportTitle="Trial Balance" dateRange="Jul 2024 – Jun 2025" />
 *   <div ref={printRef}>…report content…</div>
 *
 * The component is self-contained — no external print library required.
 * It uses the native window.print() API with a dynamically injected <style>
 * that scopes printing to only the element referenced by printRef, hiding
 * everything else on the page.
 */

import { useRef, useCallback, RefObject } from 'react'
import { Printer } from 'lucide-react'
import { format } from 'date-fns'

interface PrintButtonProps {
  /** Ref pointing at the DOM node that contains the printable report content */
  printRef: RefObject<HTMLDivElement | null>
  /** Human-readable report name — used as document title & PDF filename hint */
  reportTitle: string
  /** Optional date range string shown in the print header (e.g. "Jul 2024 – Jun 2025") */
  dateRange?: string
  /** Pass true for wide reports (Annual P&L table) to force landscape orientation */
  landscape?: boolean
  /** Additional Tailwind classes for the button */
  className?: string
  /** Whether the button should be disabled (e.g. while data is loading) */
  disabled?: boolean
}

export function PrintButton({
  printRef,
  reportTitle,
  dateRange,
  landscape = false,
  className = '',
  disabled = false,
}: PrintButtonProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null)

  const handlePrint = useCallback(() => {
    if (!printRef.current) return

    // Build a unique ID to scope the print styles
    const printId = `print-region-${Date.now()}`
    printRef.current.setAttribute('data-print-id', printId)

    // Compose document title — browser uses this as default PDF filename
    const generatedAt = format(new Date(), 'd MMM yyyy h:mm a')
    const docTitle    = dateRange
      ? `HomeBase - ${reportTitle} - ${dateRange}`
      : `HomeBase - ${reportTitle} - ${generatedAt}`

    // Inject print stylesheet
    const style = document.createElement('style')
    style.setAttribute('data-homebase-print', 'true')
    style.textContent = `
      @media print {
        /* ── Page setup ─────────────────────────────────────────────────── */
        @page {
          size: A4 ${landscape ? 'landscape' : 'portrait'};
          margin: 15mm 12mm 15mm 12mm;
        }

        /* ── Hide everything on the page using visibility (not display:none)
             Visibility is inheritable: a child CAN override visibility:hidden
             with visibility:visible, unlike display:none which blocks the
             entire subtree and cannot be overridden by descendants.
             This is the correct approach when the print target is nested
             deeply inside layout wrappers (e.g. Next.js app shell). ─────── */
        html, body {
          visibility: hidden !important;
          background: white !important;
        }

        /* ── Show our print region and all its descendants ───────────────── */
        [data-print-id="${printId}"],
        [data-print-id="${printId}"] * {
          visibility: visible !important;
        }

        /* ── Pull the print region to the top of the page ────────────────── */
        [data-print-id="${printId}"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: black !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
          font-size: 11pt !important;
          line-height: 1.4 !important;
        }

        /* ── Print header (injected by PrintWrapper) ─────────────────────── */
        .print-header {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          border-bottom: 2px solid #1a1a1a !important;
          padding-bottom: 8px !important;
          margin-bottom: 16px !important;
        }
        .print-header-title {
          font-size: 16pt !important;
          font-weight: 700 !important;
          color: #1a1a1a !important;
        }
        .print-header-meta {
          font-size: 8pt !important;
          color: #555 !important;
          text-align: right !important;
        }

        /* ── Print footer (page numbers via CSS) ─────────────────────────── */
        .print-footer {
          position: running(footer) !important;
        }
        @page {
          @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-size: 8pt;
            color: #888;
          }
          @bottom-left {
            content: "HomeBase — ${reportTitle.replace(/'/g, "\\'")}";
            font-size: 8pt;
            color: #888;
          }
        }

        /* ── Typography resets ───────────────────────────────────────────── */
        * {
          color: black !important;
          background: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* ── Tables ──────────────────────────────────────────────────────── */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          page-break-inside: auto !important;
        }
        tr {
          page-break-inside: avoid !important;
        }
        th, td {
          padding: 4px 6px !important;
          font-size: 9pt !important;
          border-bottom: 1px solid #e0e0e0 !important;
        }
        thead tr {
          background-color: #f5f5f5 !important;
          border-bottom: 1.5px solid #aaa !important;
        }
        tfoot tr {
          border-top: 1.5px solid #aaa !important;
          font-weight: 700 !important;
        }

        /* ── Preserve key colour semantics in print ──────────────────────── */
        .text-green-600, [class*="text-green"] { color: #16a34a !important; }
        .text-red-600,   [class*="text-red"]   { color: #dc2626 !important; }
        .text-orange-600 { color: #ea580c !important; }
        .text-blue-600   { color: #2563eb !important; }
        .text-purple-600 { color: #9333ea !important; }
        .text-muted-foreground { color: #555 !important; }

        /* ── Suppress interactive / screen-only elements ──────────────────── */
        button,
        [role="button"],
        input[type="date"],
        select,
        .print\\:hidden,
        [data-print-hide],
        nav,
        aside {
          display: none !important;
        }

        /* ── Don't hide the report content itself ────────────────────────── */
        [data-print-id="${printId}"] button,
        [data-print-id="${printId}"] [role="button"],
        [data-print-id="${printId}"] input,
        [data-print-id="${printId}"] select {
          display: none !important;
        }

        /* ── Borders and cards look cleaner in print ─────────────────────── */
        [class*="rounded"] {
          border-radius: 0 !important;
        }
        [class*="border"] {
          border-color: #d0d0d0 !important;
        }

        /* ── Overflow fix for wide tables (landscape) ────────────────────── */
        .overflow-x-auto, .overflow-hidden {
          overflow: visible !important;
        }
        ${landscape ? `
        /* ── Landscape: shrink font further for wide tables ──────────────── */
        td, th { font-size: 7.5pt !important; padding: 3px 4px !important; }
        ` : ''}
      }
    `
    document.head.appendChild(style)
    styleRef.current = style

    // Set document title so browser pre-fills the PDF filename
    const originalTitle = document.title
    document.title = docTitle

    // Print!
    window.print()

    // Restore after print dialog closes (synchronous — runs after print returns)
    document.title = originalTitle
    style.remove()
    printRef.current?.removeAttribute('data-print-id')
    styleRef.current = null
  }, [printRef, reportTitle, dateRange, landscape])

  return (
    <button
      onClick={handlePrint}
      disabled={disabled}
      data-print-hide
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
        'border border-border hover:bg-accent',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'transition-colors print:hidden',
        className,
      ].join(' ')}
      title={`Print / Save as PDF — ${reportTitle}`}
    >
      <Printer className="h-3.5 w-3.5" />
      Print / PDF
    </button>
  )
}
