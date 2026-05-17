// Tiny HTML5 drag-and-drop reorder helper for React.
//
// Usage:
//   const sortable = useSortable(items, setItems, { id: 'activities' })
//   ...
//   {items.map((item, i) =>
//     <div key={item.id} {...sortable.itemProps(i)}>
//       <span {...sortable.handleProps(i)}>⠿</span>
//       {item.title}
//     </div>
//   )}
//
// - Drop indicator (a 2px line) renders before/after items via CSS classes
//   `.hb-sortable--drop-before` / `--drop-after` toggled by the helper.
// - Pass `{ horizontal: true }` for left-right reordering.
// - The hook is namespaced via `id` so two separate sortables on the same page
//   don't accept each other's drops.

const { useState: useS, useRef: useR, useCallback: useC } = React

window.useSortable = function useSortable(items, setItems, opts = {}) {
  const id = opts.id || 'default'
  const handleOnly = !!opts.handleOnly
  const dragRef = useR({ from: null })
  const [overIndex, setOverIndex] = useS(-1)
  const [overPos, setOverPos] = useS('before')  // 'before' | 'after'

  function reorder(arr, from, to) {
    const copy = arr.slice()
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    return copy
  }

  function getItemProps(i) {
    return {
      draggable: !handleOnly,
      onDragStart: (e) => {
        dragRef.current = { from: i }
        try {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/x-sortable-' + id, String(i))
        } catch {}
        e.currentTarget.classList.add('hb-sortable--ghost')
      },
      onDragEnd: (e) => {
        e.currentTarget.classList.remove('hb-sortable--ghost')
        setOverIndex(-1)
      },
      onDragOver: (e) => {
        if (dragRef.current.from === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const axis = opts.horizontal ? 'x' : 'y'
        const mid = axis === 'y' ? rect.top + rect.height / 2 : rect.left + rect.width / 2
        const cur = axis === 'y' ? e.clientY : e.clientX
        const pos = cur < mid ? 'before' : 'after'
        if (overIndex !== i || overPos !== pos) {
          setOverIndex(i)
          setOverPos(pos)
        }
      },
      onDrop: (e) => {
        e.preventDefault()
        const from = dragRef.current.from
        dragRef.current.from = null
        if (from === null || from === i) { setOverIndex(-1); return }
        let to = i + (overPos === 'after' ? 1 : 0)
        if (to > from) to -= 1  // account for removal
        setItems(reorder(items, from, to))
        setOverIndex(-1)
      },
      'data-sortable-id': id,
      className: overIndex === i
        ? `hb-sortable hb-sortable--drop-${overPos}`
        : 'hb-sortable',
    }
  }

  function getHandleProps(i) {
    if (!handleOnly) return {}
    return {
      draggable: true,
      onDragStart: (e) => {
        dragRef.current = { from: i }
        try { e.dataTransfer.effectAllowed = 'move' } catch {}
        const row = e.currentTarget.closest('[data-sortable-id="' + id + '"]')
        if (row) row.classList.add('hb-sortable--ghost')
      },
      onDragEnd: (e) => {
        const row = e.currentTarget.closest('[data-sortable-id="' + id + '"]')
        if (row) row.classList.remove('hb-sortable--ghost')
        setOverIndex(-1)
      },
      style: { cursor: 'grab', touchAction: 'none' },
    }
  }

  return {
    itemProps: getItemProps,
    handleProps: getHandleProps,
  }
}
