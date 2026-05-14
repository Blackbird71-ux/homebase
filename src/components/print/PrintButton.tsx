'use client'

/**
 * PrintButton — triggers browser print / Save as PDF for a report.
 *
 * Strategy: clones the printRef element, injects extracted stylesheets, and
 * serialises the result as a blob URL opened in a new popup window. An inline
 * <script> inside the blob HTML calls window.print() after the `load` event so
 * styles are fully applied before the print dialog opens. This avoids both
 * Next.js layout bleed and the blank-page race condition that document.write()
 * causes when DOMContentLoaded fires synchronously before the listener can be
 * registered from the parent window.
 *
 * Usage:
 *   const printRef = useRef<HTMLDivElement>(null)
 *   <PrintButton printRef={printRef} reportTitle="Trial Balance" dateRange="Jul 2024 – Jun 2025" />
 *   <PrintWrapper ref={printRef} reportTitle="Trial Balance" dateRange="...">
 *     {…report JSX…}
 *   </PrintWrapper>
 */

import { useCallback, RefObject } from 'react'
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

  const handlePrint = useCallback(() => {
    const el = printRef.current
    if (!el) return

    // Compose document title — browser uses this as default PDF filename
    const generatedAt = format(new Date(), 'd MMM yyyy h:mm a')
    const docTitle = dateRange
      ? `HomeBase - ${reportTitle} - ${dateRange}`
      : `HomeBase - ${reportTitle} - ${generatedAt}`

    // Clone the report content so we don't mutate the live DOM
    const clone = el.cloneNode(true) as HTMLElement

    // Remove any interactive / screen-only elements from the clone
    clone.querySelectorAll(
      'button, [role="button"], input[type="date"], select, [data-print-hide], nav, aside'
    ).forEach(node => (node as HTMLElement).remove())

    // Make the print-only header visible (it's hidden on screen via Tailwind "hidden")
    const printHeader = clone.querySelector('.print-header') as HTMLElement | null
    if (printHeader) {
      printHeader.style.display = 'flex'
    }

    // Collect all <link rel="stylesheet"> and <style> tags from the main document
    // so Tailwind utility classes render correctly in the new window.
    // Also include preload-as-style links that Next.js may use for CSS in dev mode.
    const styleTags = Array.from(
      document.querySelectorAll(
        'link[rel="stylesheet"], link[rel="preload"][as="style"], style'
      )
    )
      .map(node => node.outerHTML)
      .join('\n')

    // Embed a print-trigger script inside the HTML so it runs from within
    // the popup's own execution context after `load` fires — far more reliable
    // than cross-window event coordination on document.write() windows.
    const printScript = `<script>
(function () {
  var done = false;
  function doPrint() {
    if (done) return;
    done = true;
    requestAnimationFrame(function () {
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    });
  }
  if (document.readyState === 'complete') {
    doPrint();
  } else {
    window.addEventListener('load', doPrint);
    setTimeout(doPrint, 2500);
  }
})();
<\/script>`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${docTitle.replace(/</g, '&lt;')}</title>
  ${styleTags}
  <style>
    /* ── Page setup ───────────────────────────────────────────────────── */
    @page {
      size: A4 ${landscape ? 'landscape' : 'portrait'};
      margin: 15mm 12mm 15mm 12mm;
    }

    /* ── Base reset for clean print output ────────────────────────────── */
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: white !important;
      color: #111 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Print header ─────────────────────────────────────────────────── */
    .print-header {
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .print-header-title {
      font-size: 16pt;
      font-weight: 700;
      color: #1a1a1a;
    }
    .print-header-meta {
      font-size: 8pt;
      color: #555;
      text-align: right;
    }

    /* ── Tables ───────────────────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
    }
    th, td {
      padding: 4px 6px;
      font-size: 9pt;
      border-bottom: 1px solid #e0e0e0;
    }
    thead tr {
      background-color: #f5f5f5 !important;
      border-bottom: 1.5px solid #aaa;
    }
    tfoot tr {
      border-top: 1.5px solid #aaa;
      font-weight: 700;
    }

    /* ── Colour semantics ─────────────────────────────────────────────── */
    .text-green-600, .text-green-700, .dark\\:text-green-400 { color: #16a34a !important; }
    .text-red-600,   .text-red-700,   .dark\\:text-red-400   { color: #dc2626 !important; }
    .text-orange-600 { color: #ea580c !important; }
    .text-blue-600   { color: #2563eb !important; }
    .text-purple-600 { color: #9333ea !important; }
    .text-muted-foreground { color: #555 !important; }
    .text-emerald-600, .text-emerald-700 { color: #059669 !important; }
    .text-amber-600  { color: #d97706 !important; }

    /* ── Background colours (cards / sections) ────────────────────────── */
    .bg-green-500\\/5, .bg-green-500\\/10 { background-color: #f0fdf4 !important; }
    .bg-red-500\\/5,   .bg-red-500\\/10   { background-color: #fef2f2 !important; }
    .bg-blue-500\\/5,  .bg-blue-500\\/10  { background-color: #eff6ff !important; }
    .bg-muted\\/40, .bg-muted\\/60 { background-color: #f8f8f8 !important; }

    /* ── Layout helpers ───────────────────────────────────────────────── */
    .overflow-x-auto, .overflow-hidden, .overflow-y-auto {
      overflow: visible !important;
    }
    /* Undo sticky positioning which breaks print layout */
    .sticky {
      position: static !important;
    }

    /* ── Borders & radius ─────────────────────────────────────────────── */
    [class*="rounded"] { border-radius: 4px !important; }
    [class*="border"]  { border-color: #d0d0d0 !important; }

    /* ── Page breaks ──────────────────────────────────────────────────── */
    .page-break { page-break-before: always; }
    h2 { page-break-before: auto; }

    ${landscape ? `
    /* ── Landscape: tighter font for wide tables ──────────────────────── */
    td, th { font-size: 7.5pt !important; padding: 3px 4px !important; }
    ` : ''}

    /* ── Screen-only elements: hide in print window too ──────────────── */
    button, [role="button"], input[type="date"],
    select, [data-print-hide], nav, aside {
      display: none !important;
    }
  </style>
</head>
<body>
${clone.outerHTML}
${printScript}
</body>
</html>`

    // Open the HTML as a blob URL so the browser treats it as a proper page
    // load (fires `load` event, applies stylesheets) rather than about:blank.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)

    const win = window.open(url, '_blank', 'width=900,height=700')
    // Revoke the blob URL after the window has had time to load it
    setTimeout(() => URL.revokeObjectURL(url), 30_000)

    if (!win) {
      // Popup blocked — the blob URL tab will open without auto-print;
      // user can print manually via Ctrl+P.
      return
    }
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
