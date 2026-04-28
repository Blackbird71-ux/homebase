'use client'

import { useState } from 'react'
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { DASHBOARD_CARDS, type DashboardCardConfig } from '@/lib/dashboard-cards'

interface DashboardCustomiserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCards: DashboardCardConfig[]
  onSaved: (cards: DashboardCardConfig[]) => void
}

function SortableCard({
  card,
  label,
  onToggle,
}: {
  card: DashboardCardConfig
  label: string
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        isDragging ? 'border-primary shadow-lg' : 'border-border'
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <button
        onClick={onToggle}
        className={`p-1.5 rounded-md transition-colors ${
          card.visible
            ? 'text-primary hover:text-primary/80'
            : 'text-muted-foreground/40 hover:text-muted-foreground'
        }`}
        aria-label={card.visible ? 'Hide card' : 'Show card'}
      >
        {card.visible ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function DashboardCustomiser({
  open,
  onOpenChange,
  initialCards,
  onSaved,
}: DashboardCustomiserProps) {
  const [cards, setCards] = useState<DashboardCardConfig[]>(initialCards)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = cards.findIndex((c) => c.id === active.id)
    const newIndex = cards.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    setCards((prev) => {
      const moved = arrayMove(prev, oldIndex, newIndex)
      return moved.map((c, i) => ({ ...c, order: i }))
    })
  }

  function handleToggle(id: string) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardCards: cards } }),
      })
      if (res.ok) {
        onSaved(cards)
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const cardLabels = new Map(DASHBOARD_CARDS.map((c) => [c.id, c.label]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customise Dashboard</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Drag to reorder cards. Toggle visibility with the eye icon.
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={cards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2 py-2">
              {cards.map((card) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  label={cardLabels.get(card.id) ?? card.id}
                  onToggle={() => handleToggle(card.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
