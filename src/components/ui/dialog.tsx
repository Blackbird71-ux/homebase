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
// Renders a drag handle in the bottom-right corner; on mobile it behaves
// identically to the regular DialogContent (no resize logic runs).
//
// Implementation note: ref={} on DialogPrimitive.Popup does not reliably
// forward to the DOM node in all base-ui versions. We instead wrap content
// in a plain <div> (guaranteed ref) and let DialogPrimitive.Popup handle
// only the portal lifecycle and open/close animation.
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
  /** Open at 88% of the viewport and let the user shrink/grow from there */
  fitViewport?: boolean
  /** localStorage key — persists the user's chosen size across opens */
  storageKey?: string
}) {
  const innerRef = React.useRef<HTMLDivElement>(null)

  // ── Initial sizing ─────────────────────────────────────────────────────────
  // Priority: saved size > fitViewport default > CSS fallback.
  // Runs before paint so there's no size flash.
  React.useLayoutEffect(() => {
    if (!fitViewport && !storageKey) return
    const el = innerRef.current
    if (!el) return

    el.style.maxWidth  = 'none'
    el.style.maxHeight = 'none'

    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          const { w, h } = JSON.parse(saved) as { w: number; h: number }
          const maxW = Math.floor(window.innerWidth  * 0.98)
          const maxH = Math.floor(window.innerHeight * 0.98)
          el.style.width  = `${Math.min(maxW, Math.max(minWidth,  w))}px`
          el.style.height = `${Math.min(maxH, Math.max(minHeight, h))}px`
          return
        }
      } catch { /* ignore corrupt storage */ }
    }

    if (fitViewport) {
      const w = Math.max(minWidth,  Math.round(window.innerWidth  * 0.88))
      const h = Math.max(minHeight, Math.round(window.innerHeight * 0.88))
      el.style.width  = `${w}px`
      el.style.height = `${h}px`
    }
  }, [fitViewport, storageKey, minWidth, minHeight])

  // ── Resize drag ────────────────────────────────────────────────────────────
  type Edge = 'se' | 's' | 'e'
  const dragging = React.useRef<Edge | null>(null)
  const origin   = React.useRef({ x: 0, y: 0, w: 0, h: 0 })

  const startResize = React.useCallback((e: React.PointerEvent<HTMLDivElement>, edge: Edge) => {
    if (window.innerWidth < 768) return
    e.preventDefault()
    const el = innerRef.current
    if (!el) return
    dragging.current = edge
    origin.current = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight }
    el.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const edge = dragging.current
    if (!edge) return
    const el = innerRef.current
    if (!el) return
    const dx = e.clientX - origin.current.x
    const dy = e.clientY - origin.current.y
    const maxW = Math.floor(window.innerWidth  * 0.98)
    const maxH = Math.floor(window.innerHeight * 0.98)
    if (edge === 'se' || edge === 'e') {
      el.style.width  = `${Math.min(maxW, Math.max(minWidth,  origin.current.w + dx))}px`
    }
    if (edge === 'se' || edge === 's') {
      el.style.height = `${Math.min(maxH, Math.max(minHeight, origin.current.h + dy))}px`
    }
  }, [minWidth, minHeight])

  const onPointerUp = React.useCallback(() => {
    if (!dragging.current) return
    dragging.current = null
    if (!storageKey) return
    const el = innerRef.current
    if (!el) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ w: el.offsetWidth, h: el.offsetHeight }))
    } catch { /* quota exceeded or private mode */ }
  }, [storageKey])

  return (
    <DialogPortal>
      <DialogOverlay />
      {/* DialogPrimitive.Popup handles portal lifecycle and open/close animation only */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        {...props}
      >
        {/* This div is the real dialog box — ref always works on a plain div */}
        <div
          ref={innerRef}
          className={cn(
            "relative pointer-events-auto grid w-full max-w-[calc(100%-2rem)] max-h-[90dvh] sm:max-w-2xl rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10",
            className
          )}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
          {/* ── Resize handles (hidden on mobile) ───────────────────────────── */}
          {/* Right edge */}
          <div
            className="absolute top-8 right-0 bottom-8 hidden md:block w-1.5 cursor-e-resize select-none touch-none hover:bg-primary/20 rounded-r-xl transition-colors"
            onPointerDown={e => startResize(e, 'e')}
          />
          {/* Bottom edge */}
          <div
            className="absolute left-8 right-8 bottom-0 hidden md:block h-1.5 cursor-s-resize select-none touch-none hover:bg-primary/20 rounded-b-xl transition-colors"
            onPointerDown={e => startResize(e, 's')}
          />
          {/* Corner SE — most prominent */}
          <div
            className="absolute bottom-0 right-0 hidden md:flex items-center justify-center w-6 h-6 cursor-se-resize select-none touch-none text-muted-foreground/30 hover:text-primary/60 transition-colors rounded-br-xl"
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
