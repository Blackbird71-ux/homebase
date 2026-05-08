'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  name: string
  email: string | null
  image: string | null
}

export default function MemberSelector({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    fetch('/api/finance/members')
      .then(res => res.ok ? res.json() : [])
      .then(setMembers)
      .catch(() => {})
  }, [])

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', className)}
    >
      <option value="">Anyone</option>
      {members.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  )
}