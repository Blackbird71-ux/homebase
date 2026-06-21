'use client'

import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { PlusIcon, StarIcon, Trash2Icon, CheckIcon, XIcon, GripVerticalIcon, ArrowLeftRightIcon, PencilIcon } from 'lucide-react'

interface ListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
  _count: { items: number }
  createdBy?: string | null
}

interface ListSelectorProps {
  lists: ListMeta[]
  activeListId: string | null
  defaultListId: string | null
  onSelect: (id: string) => void
  onNewList: () => void
  onDeleteList?: (id: string) => void
  onSetDefault?: (id: string) => void
  onRename?: (id: string, newName: string) => void
  onReorder?: (orderedIds: string[]) => void
  onConvert?: (id: string, newType: 'SHOPPING' | 'TODO') => void
  onEditList?: (id: string) => void
}

function EditableListName({
  list,
  activeListId,
  onSelect,
  onNameChanged,
}: {
  list: ListMeta
  activeListId: string | null
  onSelect: (id: string) => void
  onNameChanged: (id: string, newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Keep local name in sync when list prop changes (e.g. after rename from another session)
  useEffect(() => {
    if (!editing) setName(list.name)
  }, [list.name, editing])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === list.name) {
      setName(list.name)
      setEditing(false)
      return
    }
    const res = await fetch(`/api/lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      onNameChanged(list.id, trimmed)
      setEditing(false)
    } else {
      setName(list.name)
      setEditing(false)
    }
  }

  function handleCancel() {
    setName(list.name)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-1 py-0.5 text-sm bg-background border border-input rounded"
          maxLength={100}
        />
        <button
          onClick={handleSave}
          className="p-0.5 rounded text-green-600 hover:bg-green-100 transition-colors shrink-0"
          title="Save"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted transition-colors shrink-0"
          title="Cancel"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center gap-1 group/name">
      <button
        onClick={() => onSelect(list.id)}
        onDoubleClick={() => setEditing(true)}
        className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
          activeListId === list.id
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted'
        }`}
        title="Click to select, double-click to rename"
      >
        <span className="truncate block">{list.name}</span>
        <span className="text-xs opacity-70">{list._count.items} items</span>
      </button>
    </div>
  )
}

interface SortableListRowProps {
  list: ListMeta
  activeListId: string | null
  defaultListId: string | null
  onSelect: (id: string) => void
  onDeleteList?: (id: string) => void
  onSetDefault?: (id: string) => void
  onRename?: (id: string, newName: string) => void
  onConvert?: (id: string, newType: 'SHOPPING' | 'TODO') => void
  onEditList?: (id: string) => void
}

function SortableListRow({
  list,
  activeListId,
  defaultListId,
  onSelect,
  onDeleteList,
  onSetDefault,
  onRename,
  onConvert,
  onEditList,
}: SortableListRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: 'list' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isDefault = defaultListId === list.id

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-0.5 px-1">
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing touch-none p-2 text-muted-foreground/50 hover:text-muted-foreground focus:outline-none shrink-0"
        aria-label={`Drag ${list.name} to reorder`}
        tabIndex={-1}
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>
      <EditableListName
        list={list}
        activeListId={activeListId}
        onSelect={onSelect}
        onNameChanged={(id, newName) => onRename?.(id, newName)}
      />
      <div className="flex items-center gap-0.5">
        {onEditList && (
          <button
            onClick={() => onEditList(list.id)}
            className="p-1 rounded text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground transition-colors shrink-0 hidden group-hover:inline-flex"
            title="Edit list (change owner)"
          >
            <PencilIcon className="h-3 w-3" />
          </button>
        )}
        {onConvert && (
          <button
            onClick={() => onConvert(list.id, list.type === 'SHOPPING' ? 'TODO' : 'SHOPPING')}
            className="p-1 rounded text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground transition-colors shrink-0 hidden group-hover:inline-flex"
            title={list.type === 'SHOPPING' ? 'Convert to Todo list' : 'Convert to Shopping list'}
          >
            <ArrowLeftRightIcon className="h-3 w-3" />
          </button>
        )}
        {onSetDefault && (
          <button
            onClick={() => onSetDefault(isDefault ? '' : list.id)}
            className={`p-1 rounded transition-colors shrink-0 ${
              isDefault
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-muted-foreground/30 hover:text-muted-foreground/60 hidden group-hover:inline-flex'
            }`}
            title={isDefault ? 'Remove as default' : 'Set as default list'}
          >
            <StarIcon className={`h-3 w-3 ${isDefault ? 'fill-yellow-500' : ''}`} />
          </button>
        )}
        {onDeleteList && (
          <button
            onClick={() => onDeleteList(list.id)}
            className="p-1 rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0 hidden group-hover:inline-flex"
            title="Delete list"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

export function ListSelector({
  lists,
  activeListId,
  defaultListId,
  onSelect,
  onNewList,
  onDeleteList,
  onSetDefault,
  onRename,
  onReorder,
  onConvert,
  onEditList,
}: ListSelectorProps) {
  const shopping = lists.filter((l) => l.type === 'SHOPPING')
  const todo = lists.filter((l) => l.type === 'TODO')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Determine which section the active item belongs to
    const activeList = lists.find((l) => l.id === active.id)
    if (!activeList) return

    // Get the ordered IDs for the section this list belongs to
    const section = activeList.type === 'SHOPPING' ? shopping : todo
    const sectionIds = section.map((l) => l.id)

    const oldIndex = sectionIds.indexOf(active.id as string)
    const newIndex = sectionIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(sectionIds, oldIndex, newIndex)

    // Build the full ordered list: shopping first, then todo (preserving section order)
    const otherSection = activeList.type === 'SHOPPING' ? todo : shopping
    const otherIds = otherSection.map((l) => l.id)

    const fullOrder = activeList.type === 'SHOPPING'
      ? [...newOrder, ...otherIds]
      : [...otherIds, ...newOrder]

    onReorder?.(fullOrder)
  }

  function renderSection(title: string, sectionLists: ListMeta[]) {
    if (sectionLists.length === 0) return null

    return (
      <>
        <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          {title}
        </p>
        <SortableContext
          items={sectionLists.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {sectionLists.map((list) => (
            <SortableListRow
              key={list.id}
              list={list}
              activeListId={activeListId}
              defaultListId={defaultListId}
              onSelect={onSelect}
              onDeleteList={onDeleteList}
              onSetDefault={onSetDefault}
              onRename={onRename}
              onConvert={onConvert}
              onEditList={onEditList}
            />
          ))}
        </SortableContext>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {renderSection('Shopping', shopping)}
        {renderSection('Todo', todo)}
      </DndContext>

      <div className="mt-4 px-2">
        <Button variant="ghost" size="sm" onClick={onNewList} className="w-full justify-start gap-2">
          <PlusIcon className="h-4 w-4" />
          New list
        </Button>
      </div>
    </div>
  )
}
