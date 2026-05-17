'use client'
import { useState, useRef, useCallback } from 'react'

interface SortableOptions {
  id?: string
  handleOnly?: boolean
  horizontal?: boolean
}

interface SortableResult<T> {
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement> & { 'data-sortable-id': string }
  handleProps: (i: number) => React.HTMLAttributes<HTMLElement>
}

export function useSortable<T>(
  items: T[],
  setItems: (items: T[]) => void,
  opts: SortableOptions = {}
): SortableResult<T> {
  const id = opts.id ?? 'default'
  const handleOnly = !!opts.handleOnly
  const dragRef = useRef<{ from: number | null }>({ from: null })
  const [overIndex, setOverIndex] = useState(-1)
  const [overPos, setOverPos] = useState<'before' | 'after'>('before')

  function reorder(arr: T[], from: number, to: number): T[] {
    const copy = arr.slice()
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    return copy
  }

  const itemProps = useCallback(
    (i: number) => ({
      draggable: !handleOnly,
      onDragStart: (e: React.DragEvent<HTMLElement>) => {
        dragRef.current = { from: i }
        try {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData(`text/x-sortable-${id}`, String(i))
        } catch {}
        e.currentTarget.classList.add('hb-sortable--ghost')
      },
      onDragEnd: (e: React.DragEvent<HTMLElement>) => {
        e.currentTarget.classList.remove('hb-sortable--ghost')
        setOverIndex(-1)
      },
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (dragRef.current.from === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const mid = opts.horizontal
          ? rect.left + rect.width / 2
          : rect.top + rect.height / 2
        const cur = opts.horizontal ? e.clientX : e.clientY
        const pos: 'before' | 'after' = cur < mid ? 'before' : 'after'
        if (overIndex !== i || overPos !== pos) {
          setOverIndex(i)
          setOverPos(pos)
        }
      },
      onDrop: (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault()
        const from = dragRef.current.from
        dragRef.current.from = null
        if (from === null || from === i) { setOverIndex(-1); return }
        let to = i + (overPos === 'after' ? 1 : 0)
        if (to > from) to -= 1
        setItems(reorder(items, from, to))
        setOverIndex(-1)
      },
      'data-sortable-id': id,
      className: overIndex === i ? `hb-sortable hb-sortable--drop-${overPos}` : 'hb-sortable',
    }),
    [items, setItems, id, handleOnly, overIndex, overPos, opts.horizontal]
  )

  const handleProps = useCallback(
    (i: number) => {
      if (!handleOnly) return {}
      return {
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLElement>) => {
          dragRef.current = { from: i }
          try { e.dataTransfer.effectAllowed = 'move' } catch {}
          const row = e.currentTarget.closest(`[data-sortable-id="${id}"]`) as HTMLElement | null
          if (row) row.classList.add('hb-sortable--ghost')
        },
        onDragEnd: (e: React.DragEvent<HTMLElement>) => {
          const row = e.currentTarget.closest(`[data-sortable-id="${id}"]`) as HTMLElement | null
          if (row) row.classList.remove('hb-sortable--ghost')
          setOverIndex(-1)
        },
        style: { cursor: 'grab', touchAction: 'none' } as React.CSSProperties,
      }
    },
    [id, handleOnly]
  )

  return { itemProps, handleProps }
}
