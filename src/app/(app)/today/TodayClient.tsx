'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatInTz } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import type { TodayData, TodayScope } from '@/lib/today-data'

interface TodayClientProps {
  initialData: TodayData
  timezone: string
}

function Section({ title, href, count, children }: { title: string; href: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">
          {title} {count > 0 && <span className="text-muted-foreground font-normal">({count})</span>}
        </h2>
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">Open</Link>
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>

export function TodayClient({ initialData, timezone }: TodayClientProps) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)

  async function changeScope(scope: TodayScope) {
    if (scope === data.scope || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/today?scope=${scope}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const time = (iso: string) => formatInTz(new Date(iso), timezone, { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={cn('flex flex-col gap-4 max-w-3xl', loading && 'opacity-60')}>
      <div className="inline-flex self-start rounded-lg border border-border p-0.5 text-sm">
        {(['mine', 'family'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeScope(s)}
            className={cn('px-3 py-1 rounded-md', data.scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            {s === 'mine' ? 'Mine' : 'Family'}
          </button>
        ))}
      </div>

      <Section title="Events" href="/calendar" count={data.events.length}>
        {data.events.length === 0 ? <Empty>Nothing on the calendar today.</Empty> : (
          <ul className="flex flex-col gap-1.5">
            {data.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color ?? 'var(--accent)' }} />
                <span className="text-muted-foreground w-16 shrink-0">{e.isAllDay ? 'All day' : time(e.start)}</span>
                <span className="truncate">{e.title}</span>
                {e.location && <span className="text-xs text-muted-foreground truncate">· {e.location}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Chores" href="/chores" count={data.chores.length}>
        {data.chores.length === 0 ? <Empty>No chores due.</Empty> : (
          <ul className="flex flex-col gap-1.5">
            {data.chores.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="truncate">{c.title}</span>
                {c.isOverdue && <span className="text-xs text-destructive shrink-0">Overdue</span>}
                {data.scope === 'family' && c.assigneeName && <span className="text-xs text-muted-foreground shrink-0">· {c.assigneeName}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="To-dos" href="/lists" count={data.todos.length}>
        {data.todos.length === 0 ? <Empty>No to-dos due.</Empty> : (
          <ul className="flex flex-col gap-1.5">
            {data.todos.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Link href={`/lists?list=${t.listId}`} className="truncate hover:underline">{t.content}</Link>
                {t.isOverdue && <span className="text-xs text-destructive shrink-0">Overdue</span>}
                <span className="text-xs text-muted-foreground shrink-0">· {t.listName}</span>
                {data.scope === 'family' && t.assigneeName && <span className="text-xs text-muted-foreground shrink-0">· {t.assigneeName}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Meals" href="/meal-plan" count={data.meals.length}>
        {data.meals.length === 0 ? <Empty>No meals planned.</Empty> : (
          <ul className="flex flex-col gap-1.5">
            {data.meals.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-20 shrink-0 capitalize">{m.mealType}</span>
                {m.recipeId ? <Link href={`/recipes/${m.recipeId}`} className="truncate hover:underline">{m.name}</Link> : <span className="truncate">{m.name}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
