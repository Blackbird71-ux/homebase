"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon, GripHorizontal } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

// ── WideDialogContent ────────────────────────────────────────────────────────────────
// Large, CSS-only dialog for complex two-column finance forms (Bills, Income,
// Templates). No JavaScript sizing — just Tailwind viewport units.
//
// Desktop (≥ md / 768px):
//   • Centred modal: up to 1200px wide × 820px tall, fills big screens nicely
// Mobile (< md):
//   • Bottom sheet: slides up from the bottom, full width, auto height,
//     scrolls internally so all content is reachable with one-thumb scrolling
function WideDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // —— Shared ——
          "fixed z-50 flex flex-col",
          "bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10",
          "duration-150 outline-none",
          // —— Mobile: bottom sheet ——
          // Anchored to the bottom, full width, auto height up to 92dvh.
          // Rounded top corners only. Slides in from below.
          "bottom-0 left-0 right-0 md:bottom-auto md:left-1/2 md:right-auto",
          "w-full md:w-[min(calc(100vw-1rem),1360px)]",
          "max-h-[92dvh] md:max-h-none",
          "h-auto md:h-[min(90dvh,840px)]",
          "rounded-t-2xl md:rounded-xl md:-translate-x-1/2 md:-translate-y-1/2 md:top-1/2",
          // Open/close animations: slide-up on mobile, zoom on desktop
          "data-open:animate-in data-closed:animate-out",
          "data-open:max-md:slide-in-from-bottom data-closed:max-md:slide-out-to-bottom",
          "data-open:md:fade-in-0 data-open:md:zoom-in-95",
          "data-closed:md:fade-out-0 data-closed:md:zoom-out-95",
          className
        )}
        {...props}
      >
        {/* Drag pill — mobile only, gives a visual affordance for the bottom sheet */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 md:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {children}

        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-10"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// ── ResizableDialogContent ──────────────────────────────────────────────────
// Kept for backward compatibility with any dialog that explicitly needs
// user-resizable behaviour. For the main finance forms, use WideDialogContent.
//
// Key architectural fix: base-ui does NOT unmount Popup content on close — it
// hides it via CSS. This means useLayoutEffect(()=>{},[]) only fires ONCE ever
// (on first mount), not on every open. To restore saved size on re-open we
// watch the Popup’s data-open attribute via a MutationObserver instead of
// relying on mount/unmount lifecycle.
function ResizableDialogContent({
  className,
  children,
  showCloseButton = true,
  minWidth = 480,
  minHeight = 300,
  storageKey,
  ...props
}: Omit<DialogPrimitive.Popup.Props, 'className'> & {
  className?: string
  showCloseButton?: boolean
  minWidth?: number
  minHeight?: number
  /** localStorage key — persists the user’s chosen size across sessions */
  storageKey?: string
}) {
  const popupRef = React.useRef<HTMLDivElement>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function readSaved(): { w: number; h: number } | null {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const p = JSON.parse(raw) as { w: number; h: number }
      if (typeof p.w === 'number' && typeof p.h === 'number') return p
    } catch { /* corrupt */ }
    return null
  }

  function writeSaved(w: number, h: number) {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify({ w, h })) } catch { /* quota */ }
  }

  function applySize(el: HTMLElement, w: number, h: number) {
    const maxW = Math.floor(window.innerWidth  * 0.98)
    const maxH = Math.floor(window.innerHeight * 0.98)
    el.style.width     = `${Math.min(maxW, Math.max(minWidth,  w))}px`
    el.style.height    = `${Math.min(maxH, Math.max(minHeight, h))}px`
    el.style.maxWidth  = 'none'
    el.style.maxHeight = 'none'
  }

  function computeDefaultSize(): { w: number; h: number } {
    return {
      w: Math.min(1200, Math.round(window.innerWidth  * 0.88)),
      h: Math.min(820,  Math.round(window.innerHeight * 0.88)),
    }
  }

  // ── Apply size whenever the dialog becomes visible ───────────────────────────
  // base-ui keeps the Popup mounted (hidden via CSS) so we cannot rely on
  // mount/unmount. Instead we watch for the data-open attribute appearing on
  // the popup element via a MutationObserver, which fires on every open.
  React.useEffect(() => {
    const el = popupRef.current
    if (!el) return

    function applyOnOpen() {
      if (!el) return
      const saved = readSaved()
      if (saved) {
        applySize(el, saved.w, saved.h)
      } else {
        const { w, h } = computeDefaultSize()
        applySize(el, w, h)
      }
    }

    // Apply immediately in case the dialog starts open
    if (el.dataset.open !== undefined) applyOnOpen()

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.attributeName === 'data-open') {
          // data-open was added — dialog just opened
          if ((m.target as HTMLElement).dataset.open !== undefined) {
            applyOnOpen()
          }
        }
      }
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-open'] })
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, minWidth, minHeight])

  // ── Resize drag via window listeners ───────────────────────────────────────
  // Window-level pointermove/pointerup listeners fire even when the pointer
  // leaves the dialog box, preventing the "jump to fullscreen" bug.
  type Edge = 'se' | 's' | 'e'
  const dragging = React.useRef<Edge | null>(null)
  const origin   = React.useRef({ x: 0, y: 0, w: 0, h: 0 })

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const edge = dragging.current
      if (!edge) return
      const el = popupRef.current
      if (!el) return
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      if (edge === 'se' || edge === 'e') {
        el.style.width  = `${Math.min(Math.floor(window.innerWidth * 0.98),  Math.max(minWidth,  origin.current.w + dx))}px`
      }
      if (edge === 'se' || edge === 's') {
        el.style.height = `${Math.min(Math.floor(window.innerHeight * 0.98), Math.max(minHeight, origin.current.h + dy))}px`
      }
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = null
      const el = popupRef.current
      if (!el) return
      writeSaved(el.offsetWidth, el.offsetHeight)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minWidth, minHeight, storageKey])

  const startResize = React.useCallback((e: React.PointerEvent<HTMLDivElement>, edge: Edge) => {
    if (window.innerWidth < 768) return
    e.preventDefault()
    e.stopPropagation()
    const el = popupRef.current
    if (!el) return
    el.style.maxWidth  = 'none'
    el.style.maxHeight = 'none'
    dragging.current = edge
    origin.current = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }, [])

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={popupRef}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
          "flex flex-col",
          "rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10",
          "duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-10"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}

        {/* ── Resize handles (desktop only) ──────────────────────────── */}
        <div
          className="absolute top-8 right-0 bottom-8 hidden md:block w-2 cursor-e-resize select-none touch-none hover:bg-primary/20 rounded-r-xl transition-colors"
          onPointerDown={e => startResize(e, 'e')}
        />
        <div
          className="absolute left-8 right-8 bottom-0 hidden md:block h-2 cursor-s-resize select-none touch-none hover:bg-primary/20 rounded-b-xl transition-colors"
          onPointerDown={e => startResize(e, 's')}
        />
        <div
          className="absolute bottom-0 right-0 hidden md:flex items-center justify-center w-7 h-7 cursor-se-resize select-none touch-none text-muted-foreground/40 hover:text-primary/70 transition-colors rounded-br-xl"
          onPointerDown={e => startResize(e, 'se')}
          title="Drag to resize"
        >
          <GripHorizontal className="h-3.5 w-3.5 rotate-45" />
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  WideDialogContent,
  ResizableDialogContent,
}
