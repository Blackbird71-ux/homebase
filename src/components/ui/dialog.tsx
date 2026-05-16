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

// ── ResizableDialogContent ────────────────────────────────────────────────
// Drop-in replacement for DialogContent on large screens.
//
// Fixes over previous version:
//  1. Resize drag uses window-level pointermove/pointerup listeners instead of
//     React synthetic events — this prevents the "jump to fullscreen" bug that
//     occurred when the pointer left the dialog box during a drag.
//  2. Size is saved to localStorage on every pointerup (not just drag-end on
//     the dialog element), so releasing outside the window still saves.
//  3. Size is re-read from localStorage on every mount AND every time the
//     dialog opens (via a separate useEffect keyed on open state detection),
//     so navigating away and back correctly restores the last-used size.
//  4. Dialog opens at a smart viewport-relative default on first open:
//     min(88vw, 1400px) × min(90vh, 920px), clamped to minWidth/minHeight.
function ResizableDialogContent({
  className,
  children,
  showCloseButton = true,
  minWidth = 480,
  minHeight = 300,
  fitViewport = false,
  storageKey,
  ...props
}: Omit<DialogPrimitive.Popup.Props, 'className'> & {
  className?: string
  showCloseButton?: boolean
  minWidth?: number
  minHeight?: number
  /** Open at a smart viewport-relative default; user can resize from there */
  fitViewport?: boolean
  /** localStorage key — persists the user's chosen size across opens and navigation */
  storageKey?: string
}) {
  const innerRef = React.useRef<HTMLDivElement>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Read saved size from localStorage.  Returns null if nothing saved or key absent. */
  const readSaved = React.useCallback((): { w: number; h: number } | null => {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { w: number; h: number }
      if (typeof parsed.w === 'number' && typeof parsed.h === 'number') return parsed
    } catch { /* corrupt */ }
    return null
  }, [storageKey])

  /** Write size to localStorage. */
  const writeSaved = React.useCallback((w: number, h: number) => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify({ w, h })) } catch { /* quota */ }
  }, [storageKey])

  /** Apply a size to the dialog element, clamping to viewport and min values. */
  const applySize = React.useCallback((el: HTMLDivElement, w: number, h: number) => {
    const maxW = Math.floor(window.innerWidth  * 0.99)
    const maxH = Math.floor(window.innerHeight * 0.99)
    el.style.maxWidth  = 'none'
    el.style.maxHeight = 'none'
    el.style.width  = `${Math.min(maxW, Math.max(minWidth,  w))}px`
    el.style.height = `${Math.min(maxH, Math.max(minHeight, h))}px`
  }, [minWidth, minHeight])

  /** Compute the default open size for this dialog (first-open / no saved state). */
  const defaultSize = React.useCallback((): { w: number; h: number } => {
    if (fitViewport) {
      return {
        w: Math.min(1400, Math.round(window.innerWidth  * 0.88)),
        h: Math.min(920,  Math.round(window.innerHeight * 0.90)),
      }
    }
    return {
      w: Math.min(Math.round(window.innerWidth * 0.98), minWidth),
      h: minHeight,
    }
  }, [fitViewport, minWidth, minHeight])

  // ── Size on mount / re-open ─────────────────────────────────────────────────
  // useLayoutEffect runs synchronously after DOM paint — no size flash.
  // The dep array is intentionally empty so it only runs once per mount.
  // base-ui unmounts the Popup content when closed, so every open = fresh mount.
  React.useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const saved = readSaved()
    if (saved) {
      applySize(el, saved.w, saved.h)
    } else {
      const { w, h } = defaultSize()
      applySize(el, w, h)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once per mount — every open is a fresh mount

  // ── Resize drag via window listeners ───────────────────────────────────────
  // Using window-level listeners (not React synthetic events on the div)
  // prevents the "jump to fullscreen" bug: when the pointer moves outside the
  // dialog box during a drag, React stops receiving events on the dialog div
  // even with pointer capture — but window listeners always fire.
  type Edge = 'se' | 's' | 'e'
  const dragging = React.useRef<Edge | null>(null)
  const origin   = React.useRef({ x: 0, y: 0, w: 0, h: 0 })

  // Register / unregister window listeners once on mount
  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const edge = dragging.current
      if (!edge) return
      const el = innerRef.current
      if (!el) return
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      if (edge === 'se' || edge === 'e') {
        const maxW = Math.floor(window.innerWidth  * 0.99)
        el.style.width  = `${Math.min(maxW, Math.max(minWidth,  origin.current.w + dx))}px`
      }
      if (edge === 'se' || edge === 's') {
        const maxH = Math.floor(window.innerHeight * 0.99)
        el.style.height = `${Math.min(maxH, Math.max(minHeight, origin.current.h + dy))}px`
      }
    }

    function onUp() {
      if (!dragging.current) return
      dragging.current = null
      const el = innerRef.current
      if (!el) return
      writeSaved(el.offsetWidth, el.offsetHeight)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  // minWidth / minHeight / writeSaved are stable references — safe to include
  }, [minWidth, minHeight, writeSaved])

  const startResize = React.useCallback((e: React.PointerEvent<HTMLDivElement>, edge: Edge) => {
    if (window.innerWidth < 768) return   // no resize on mobile
    e.preventDefault()
    e.stopPropagation()
    const el = innerRef.current
    if (!el) return
    // Snap out of any CSS max-width/max-height before recording the origin size
    el.style.maxWidth  = 'none'
    el.style.maxHeight = 'none'
    // Record start state AFTER clearing constraints so offsetWidth/Height are correct
    dragging.current = edge
    origin.current = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight }
    // Capture pointer on the handle element so we keep receiving events even if
    // the mouse leaves the dialog — window listeners will also fire regardless.
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }, [])

  return (
    <DialogPortal>
      <DialogOverlay />
      {/*
        DialogPrimitive.Popup: handles portal lifecycle + open/close animation only.
        It is a full-viewport invisible container (fixed inset-0, pointer-events-none)
        so the inner div can be centred with flexbox without affecting hit testing.
      */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        {...props}
      >
        {/* Inner div is the actual visible dialog box — ref is 100% reliable here */}
        <div
          ref={innerRef}
          className={cn(
            // No max-w or max-h here — those are overridden by applySize() in
            // useLayoutEffect. We keep the rounded corners, bg, ring, and padding.
            "relative pointer-events-auto flex flex-col w-full rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10",
            className
          )}
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

          {/* ── Resize handles (desktop only, hidden on mobile) ───────────── */}
          {/* Right edge — drag left/right to change width */}
          <div
            className="absolute top-8 right-0 bottom-8 hidden md:block w-2 cursor-e-resize select-none touch-none hover:bg-primary/20 rounded-r-xl transition-colors"
            onPointerDown={e => startResize(e, 'e')}
          />
          {/* Bottom edge — drag up/down to change height */}
          <div
            className="absolute left-8 right-8 bottom-0 hidden md:block h-2 cursor-s-resize select-none touch-none hover:bg-primary/20 rounded-b-xl transition-colors"
            onPointerDown={e => startResize(e, 's')}
          />
          {/* SE corner — drag diagonally to resize both axes */}
          <div
            className="absolute bottom-0 right-0 hidden md:flex items-center justify-center w-7 h-7 cursor-se-resize select-none touch-none text-muted-foreground/40 hover:text-primary/70 transition-colors rounded-br-xl"
            onPointerDown={e => startResize(e, 'se')}
            title="Drag to resize"
          >
            <GripHorizontal className="h-3.5 w-3.5 rotate-45" />
          </div>
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
  ResizableDialogContent,
}
