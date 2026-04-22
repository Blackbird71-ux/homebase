# Homebase Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Settings page (4 tabs), add Umami analytics, theme switching, and mobile responsiveness.

**Architecture:** Settings stored in DB (User + Family models), read server-side in layout, mutated via PATCH API routes. Theme managed by next-themes. Mobile sidebar via Shadcn Sheet.

**Tech Stack:** Next.js 16.2.4, Prisma 7, next-auth v5 beta, next-themes, Tailwind CSS v4, Shadcn UI (Sheet, Tabs), Lucide React

**Project root (worktree):** `C:\Users\liddlem\.config\superpowers\worktrees\homebase\phase1`

---

## Breaking Changes Reminder (apply in every task)

- **Prisma 7**: No `url` in `schema.prisma`. Client uses `PrismaBetterSqlite3` adapter. See `src/lib/prisma.ts`. Never add a `url` field.
- **Next.js 16 dynamic params**: Always `Promise<{id: string}>` — always `await params`.
- **Tailwind v4**: No `tailwind.config.ts`. CSS vars in `:root` in `globals.css`. No `darkMode` config key.
- **Shadcn Button**: Uses `@base-ui/react/button`, no `asChild` prop. Use `render` prop for polymorphic rendering.
- **next-auth v5**: Server components: `import { auth } from '@/lib/auth'`. Client components: `import { signIn, signOut } from 'next-auth/react'`.
- **Shadcn Tabs**: Uses `@base-ui/react/tabs`. Active tab indicated by `data-active` attribute (not `aria-selected`). Use `value`/`defaultValue` props.
- **Shadcn Sheet**: Uses `@base-ui/react/dialog` under the hood. `SheetContent` accepts `side="left"`.
- **Shadcn Dialog**: Uses `@base-ui/react/dialog`. `DialogClose` uses `render` prop for button wrapping.

---

## Task 1: Settings APIs

**Goal:** Create all API routes needed by the Settings page.

**Files to create:**
- `src/app/api/settings/route.ts`
- `src/app/api/settings/family/route.ts`
- `src/app/api/family/members/route.ts`
- `src/app/api/export/route.ts`

**Files to create (tests):**
- `src/app/api/settings/__tests__/route.test.ts`
- `src/app/api/settings/family/__tests__/route.test.ts`

### Steps

- [ ] **1.1** Create `src/app/api/settings/__tests__/route.test.ts`

```typescript
// src/app/api/settings/__tests__/route.test.ts
import { GET, PATCH } from '../route'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    family: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth-helpers', () => ({
  requireSession: jest.fn(),
}))

const mockSession = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 0,
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  theme: 'dark',
  fontSize: 'base',
  weekStartsOn: 0,
  password: 'hashed',
  family: {
    id: 'family-1',
    name: 'Test Family',
    umamiScriptUrl: null,
    umamiSiteId: null,
  },
}

describe('GET /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
  })

  it('returns user and family settings', async () => {
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.name).toBe('Test User')
    expect(body.theme).toBe('dark')
    expect(body.family.name).toBe('Test Family')
  })

  it('returns 404 if user not found', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, theme: 'light' })
  })

  it('updates theme', async () => {
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'light' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ theme: 'light' }) })
    )
  })

  it('rejects invalid theme value', async () => {
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'rainbow' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('rejects password change when currentPassword is wrong', async () => {
    const bcrypt = await import('bcryptjs')
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass123' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **1.2** Create `src/app/api/settings/route.ts`

```typescript
// src/app/api/settings/route.ts
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const session = await requireSession()

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
      family: {
        select: {
          id: true,
          name: true,
          umamiScriptUrl: true,
          umamiSiteId: true,
        },
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: Request) {
  const session = await requireSession()
  const body = await req.json()

  const { theme, fontSize, weekStartsOn, name, currentPassword, newPassword } = body

  // Validate theme
  if (theme !== undefined && !['light', 'dark', 'system'].includes(theme)) {
    return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 })
  }

  // Validate fontSize
  if (fontSize !== undefined && !['sm', 'base', 'lg'].includes(fontSize)) {
    return NextResponse.json({ error: 'Invalid fontSize value' }, { status: 400 })
  }

  // Validate weekStartsOn
  if (weekStartsOn !== undefined && ![0, 1].includes(weekStartsOn)) {
    return NextResponse.json({ error: 'Invalid weekStartsOn value' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (theme !== undefined) updateData.theme = theme
  if (fontSize !== undefined) updateData.fontSize = fontSize
  if (weekStartsOn !== undefined) updateData.weekStartsOn = weekStartsOn
  if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
    updateData.name = name.trim()
  }

  // Handle password change
  if (currentPassword !== undefined || newPassword !== undefined) {
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Both currentPassword and newPassword are required' },
        { status: 400 }
      )
    }
    if (typeof newPassword === 'string' && newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }
    const user = await prisma.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    updateData.password = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: session.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
    },
  })

  return NextResponse.json(updated)
}
```

- [ ] **1.3** Create `src/app/api/settings/family/__tests__/route.test.ts`

```typescript
// src/app/api/settings/family/__tests__/route.test.ts
import { PATCH } from '../route'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    family: { update: jest.fn() },
  },
}))

jest.mock('@/lib/auth-helpers', () => ({
  requireAdmin: jest.fn(),
}))

const mockAdmin = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 0,
}

describe('PATCH /api/settings/family', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAdmin as jest.Mock).mockResolvedValue(mockAdmin)
    ;(prisma.family.update as jest.Mock).mockResolvedValue({
      id: 'family-1',
      name: 'Updated Family',
      umamiScriptUrl: 'https://umami.example.com/script.js',
      umamiSiteId: 'abc-123',
    })
  })

  it('updates family name and Umami settings', async () => {
    const req = new Request('http://localhost/api/settings/family', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Updated Family',
        umamiScriptUrl: 'https://umami.example.com/script.js',
        umamiSiteId: 'abc-123',
      }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(prisma.family.update).toHaveBeenCalledWith({
      where: { id: 'family-1' },
      data: {
        name: 'Updated Family',
        umamiScriptUrl: 'https://umami.example.com/script.js',
        umamiSiteId: 'abc-123',
      },
      select: {
        id: true,
        name: true,
        umamiScriptUrl: true,
        umamiSiteId: true,
      },
    })
  })

  it('allows clearing Umami settings with empty string', async () => {
    ;(prisma.family.update as jest.Mock).mockResolvedValue({
      id: 'family-1',
      name: 'Test Family',
      umamiScriptUrl: null,
      umamiSiteId: null,
    })
    const req = new Request('http://localhost/api/settings/family', {
      method: 'PATCH',
      body: JSON.stringify({ umamiScriptUrl: '', umamiSiteId: '' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
  })

  it('returns 400 when no fields provided', async () => {
    const req = new Request('http://localhost/api/settings/family', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **1.4** Create `src/app/api/settings/family/route.ts`

```typescript
// src/app/api/settings/family/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'

export async function PATCH(req: Request) {
  const session = await requireAdmin()
  const body = await req.json()

  const { name, umamiScriptUrl, umamiSiteId } = body

  const updateData: Record<string, unknown> = {}
  if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
    updateData.name = name.trim()
  }
  // Allow empty string to clear Umami settings (null out)
  if (umamiScriptUrl !== undefined) {
    updateData.umamiScriptUrl = umamiScriptUrl === '' ? null : umamiScriptUrl
  }
  if (umamiSiteId !== undefined) {
    updateData.umamiSiteId = umamiSiteId === '' ? null : umamiSiteId
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await prisma.family.update({
    where: { id: session.familyId },
    data: updateData,
    select: {
      id: true,
      name: true,
      umamiScriptUrl: true,
      umamiSiteId: true,
    },
  })

  return NextResponse.json(updated)
}
```

- [ ] **1.5** Create `src/app/api/family/members/route.ts`

```typescript
// src/app/api/family/members/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'

export async function GET() {
  const session = await requireAdmin()

  const members = await prisma.user.findMany({
    where: { familyId: session.familyId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(members)
}
```

- [ ] **1.6** Create `src/app/api/export/route.ts`

```typescript
// src/app/api/export/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST() {
  const session = await requireSession()
  const { familyId } = session

  const [family, events, lists, recipes, mealPlans, coziImports] = await Promise.all([
    prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true, name: true },
    }),
    prisma.event.findMany({
      where: { familyId },
      orderBy: { start: 'asc' },
    }),
    prisma.list.findMany({
      where: { familyId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.recipe.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.mealPlan.findMany({
      where: { familyId },
      include: { recipe: { select: { title: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.coziImport.findMany({
      where: { familyId },
      orderBy: { importedAt: 'desc' },
    }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.email,
    family,
    events,
    lists,
    recipes,
    mealPlans,
    coziImports,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="homebase-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
```

- [ ] **1.7** Run tests

```bash
cd "C:\Users\liddlem\.config\superpowers\worktrees\homebase\phase1"
npx jest src/app/api/settings --passWithNoTests
```

Expected output:
```
PASS src/app/api/settings/__tests__/route.test.ts
PASS src/app/api/settings/family/__tests__/route.test.ts
Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
```

**Commit:** `feat: settings + export API routes (GET/PATCH /api/settings, PATCH /api/settings/family, GET /api/family/members, POST /api/export)`

---

## Task 2: Settings Page Scaffold + Account Tab

**Goal:** Create the Settings page with a 4-tab layout. Implement the Account tab (name, password, admin: family name, invite codes, members list).

**Files to create:**
- `src/app/(app)/settings/page.tsx`
- `src/components/settings/AccountTab.tsx`
- `src/components/settings/SettingsShell.tsx`

**Files to modify:**
- `src/components/layout/Sidebar.tsx` — update Settings link to `/settings`

### Steps

- [ ] **2.1** Update `src/components/layout/Sidebar.tsx` — change Settings href from `/settings/integrations` to `/settings`

```typescript
// src/components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Home, Calendar, CheckSquare, ChefHat, CalendarDays,
  Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/lists', label: 'Lists', icon: CheckSquare },
  { href: '/recipes', label: 'Recipes', icon: ChefHat },
  { href: '/meal-plan', label: 'Meal Plan', icon: CalendarDays },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-52 shrink-0 h-full border-r border-border" style={{ backgroundColor: 'var(--color-sidebar)' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
          🏠 Homebase
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom: Settings + Sign out */}
      <div className="px-2 py-4 border-t border-border space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **2.2** Create `src/components/settings/AccountTab.tsx`

```typescript
// src/components/settings/AccountTab.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, AlertCircle, Copy, RefreshCw } from 'lucide-react'

interface InviteCode {
  id: string
  code: string
  used: boolean
  usedBy: string | null
  createdAt: string
  expiresAt: string | null
}

interface FamilyMember {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

interface AccountTabProps {
  user: {
    id: string
    name: string
    email: string
    role: string
    family: {
      id: string
      name: string
    }
  }
}

type Status = { type: 'success' | 'error'; message: string } | null

export function AccountTab({ user }: AccountTabProps) {
  const isAdmin = user.role === 'admin'

  // Profile
  const [name, setName] = useState(user.name)
  const [nameStatus, setNameStatus] = useState<Status>(null)
  const [nameSaving, setNameSaving] = useState(false)

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<Status>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Family name (admin only)
  const [familyName, setFamilyName] = useState(user.family.name)
  const [familyNameStatus, setFamilyNameStatus] = useState<Status>(null)
  const [familyNameSaving, setFamilyNameSaving] = useState(false)

  // Invite codes (admin only)
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCodesLoaded, setInviteCodesLoaded] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<Status>(null)

  // Members (admin only)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)

  async function saveName() {
    if (!name.trim()) return
    setNameSaving(true)
    setNameStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.ok) {
        setNameStatus({ type: 'success', message: 'Name updated.' })
      } else {
        const data = await res.json()
        setNameStatus({ type: 'error', message: data.error ?? 'Failed to update name.' })
      }
    } catch {
      setNameStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setNameSaving(false)
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'All password fields are required.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 8 characters.' })
      return
    }
    setPasswordSaving(true)
    setPasswordStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPasswordStatus({ type: 'success', message: 'Password updated.' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const data = await res.json()
        setPasswordStatus({ type: 'error', message: data.error ?? 'Failed to update password.' })
      }
    } catch {
      setPasswordStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setPasswordSaving(false)
    }
  }

  async function saveFamilyName() {
    if (!familyName.trim()) return
    setFamilyNameSaving(true)
    setFamilyNameStatus(null)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: familyName.trim() }),
      })
      if (res.ok) {
        setFamilyNameStatus({ type: 'success', message: 'Family name updated.' })
      } else {
        const data = await res.json()
        setFamilyNameStatus({ type: 'error', message: data.error ?? 'Failed to update family name.' })
      }
    } catch {
      setFamilyNameStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setFamilyNameSaving(false)
    }
  }

  async function loadInviteCodes() {
    setInviteCodesLoaded(true)
    const res = await fetch('/api/invite')
    if (res.ok) setInviteCodes(await res.json())
  }

  async function generateInvite() {
    setInviteLoading(true)
    setInviteStatus(null)
    try {
      const res = await fetch('/api/invite', { method: 'POST' })
      if (res.ok) {
        const newCode = await res.json()
        setInviteCodes(prev => [
          { ...newCode, used: false, usedBy: null, id: newCode.code, createdAt: new Date().toISOString() },
          ...prev,
        ])
        setInviteStatus({ type: 'success', message: `Invite code generated: ${newCode.code}` })
      } else {
        setInviteStatus({ type: 'error', message: 'Failed to generate invite code.' })
      }
    } catch {
      setInviteStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setInviteLoading(false)
    }
  }

  async function loadMembers() {
    setMembersLoaded(true)
    const res = await fetch('/api/family/members')
    if (res.ok) setMembers(await res.json())
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>Update the name shown to other family members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <p className="text-xs text-muted-foreground">Email: {user.email}</p>
          <Button onClick={saveName} disabled={nameSaving || !name.trim()}>
            {nameSaving ? 'Saving...' : 'Save Name'}
          </Button>
          {nameStatus && (
            <StatusMessage status={nameStatus} />
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Enter your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Button onClick={savePassword} disabled={passwordSaving}>
            {passwordSaving ? 'Updating...' : 'Update Password'}
          </Button>
          {passwordStatus && <StatusMessage status={passwordStatus} />}
        </CardContent>
      </Card>

      {/* Admin: Family Name */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Family Name</CardTitle>
            <CardDescription>Admin only — changes the name shown in the app header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family Name</Label>
              <Input
                id="family-name"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                placeholder="Family name"
              />
            </div>
            <Button onClick={saveFamilyName} disabled={familyNameSaving || !familyName.trim()}>
              {familyNameSaving ? 'Saving...' : 'Save Family Name'}
            </Button>
            {familyNameStatus && <StatusMessage status={familyNameStatus} />}
          </CardContent>
        </Card>
      )}

      {/* Admin: Invite Codes */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Codes</CardTitle>
            <CardDescription>Generate codes to invite new family members. Codes expire in 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={generateInvite} disabled={inviteLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {inviteLoading ? 'Generating...' : 'Generate Invite Code'}
              </Button>
              {!inviteCodesLoaded && (
                <Button variant="outline" onClick={loadInviteCodes}>
                  Load History
                </Button>
              )}
            </div>
            {inviteStatus && <StatusMessage status={inviteStatus} />}
            {inviteCodesLoaded && inviteCodes.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {inviteCodes.map(code => (
                  <div key={code.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{code.code}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${code.used ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
                        {code.used ? 'Used' : 'Active'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {code.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          Expires {new Date(code.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      {!code.used && (
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {inviteCodesLoaded && inviteCodes.length === 0 && (
              <p className="text-sm text-muted-foreground">No invite codes generated yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin: Family Members */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Family Members</CardTitle>
            <CardDescription>All accounts with access to your family&apos;s Homebase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!membersLoaded && (
              <Button variant="outline" onClick={loadMembers}>
                Load Members
              </Button>
            )}
            {membersLoaded && members.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusMessage({ status }: { status: { type: 'success' | 'error'; message: string } }) {
  return (
    <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
      {status.type === 'success'
        ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
        : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{status.message}</span>
    </div>
  )
}
```

- [ ] **2.3** Create `src/app/(app)/settings/page.tsx`

```typescript
// src/app/(app)/settings/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'

export default async function SettingsPage() {
  const session = await requireSession()

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
      family: {
        select: {
          id: true,
          name: true,
          umamiScriptUrl: true,
          umamiSiteId: true,
        },
      },
    },
  })

  if (!user) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="account" className="w-full max-w-2xl">
          <TabsList className="mb-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountTab user={user} />
          </TabsContent>

          <TabsContent value="appearance">
            <div className="text-muted-foreground text-sm">Appearance settings — coming in Task 3.</div>
          </TabsContent>

          <TabsContent value="integrations">
            <div className="text-muted-foreground text-sm">Integrations — coming in Task 4.</div>
          </TabsContent>

          <TabsContent value="data">
            <div className="text-muted-foreground text-sm">Data — coming in Task 5.</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **2.4** Verify the page loads at `/settings` with all 4 tabs visible, Account tab shows name + password + admin sections for admin users.

**Commit:** `feat: settings page scaffold + Account tab (name, password, family name, invite codes, members list)`

---

## Task 3: Appearance Tab + Theme System

**Goal:** Add ThemeProvider to root layout, implement theme/fontSize/weekStart controls in Appearance tab.

**Files to modify:**
- `src/app/layout.tsx` — wrap in ThemeProvider, apply fontSize class to `<html>`
- `src/app/(app)/settings/page.tsx` — replace Appearance tab placeholder with `<AppearanceTab>`

**Files to create:**
- `src/components/settings/AppearanceTab.tsx`
- `src/components/providers/ThemeProvider.tsx`

### Steps

- [ ] **3.1** Create `src/components/providers/ThemeProvider.tsx`

```typescript
// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **3.2** Modify `src/app/layout.tsx` — add ThemeProvider and dynamic fontSize class on `<html>`

The root layout must:
1. Import and use `ThemeProvider`
2. Read the session to get `User.fontSize` for server-side class on `<html>`
3. Apply the font size class alongside `h-full`

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Homebase',
  description: 'Your family hub',
}

const fontSizeClassMap: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Read font size from DB for server-side application
  // Falls back to 'base' if not logged in
  let fontSize = 'base'
  try {
    const session = await auth()
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: { fontSize: true },
      })
      if (user?.fontSize) fontSize = user.fontSize
    }
  } catch {
    // Not logged in or DB error — use default
  }

  const fontSizeClass = fontSizeClassMap[fontSize] ?? 'text-base'

  return (
    <html lang="en" className={`h-full ${fontSizeClass}`} suppressHydrationWarning>
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Note: `suppressHydrationWarning` on `<html>` is required because `next-themes` modifies the `class` attribute client-side to apply the theme, which would otherwise cause a hydration mismatch.

- [ ] **3.3** Create `src/components/settings/AppearanceTab.tsx`

```typescript
// src/components/settings/AppearanceTab.tsx
'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppearanceTabProps {
  initialTheme: string
  initialFontSize: string
  initialWeekStartsOn: number
}

type Status = { type: 'success' | 'error'; message: string } | null

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

const fontSizeOptions = [
  { value: 'sm', label: 'Small', previewClass: 'text-sm' },
  { value: 'base', label: 'Base', previewClass: 'text-base' },
  { value: 'lg', label: 'Large', previewClass: 'text-lg' },
] as const

const weekStartOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
] as const

export function AppearanceTab({ initialTheme, initialFontSize, initialWeekStartsOn }: AppearanceTabProps) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(initialTheme)
  const [fontSize, setFontSize] = useState(initialFontSize)
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, fontSize, weekStartsOn }),
      })
      if (res.ok) {
        // Apply theme immediately via next-themes
        setTheme(theme)
        // Font size change requires a page reload to re-apply the html class from server
        setStatus({ type: 'success', message: 'Appearance settings saved. Reload the page to apply font size changes.' })
      } else {
        const data = await res.json()
        setStatus({ type: 'error', message: data.error ?? 'Failed to save.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose how Homebase looks to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setLocalTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors flex-1',
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle>Font Size</CardTitle>
          <CardDescription>Adjust the base text size across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {fontSizeOptions.map(({ value, label, previewClass }) => (
              <button
                key={value}
                onClick={() => setFontSize(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors flex-1',
                  fontSize === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className={cn('font-medium', previewClass)}>Aa</span>
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Week Start */}
      <Card>
        <CardHeader>
          <CardTitle>Week Starts On</CardTitle>
          <CardDescription>Sets the first day of the week in Calendar and Meal Plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {weekStartOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setWeekStartsOn(value)}
                className={cn(
                  'flex items-center justify-center p-3 rounded-lg border-2 transition-colors flex-1',
                  weekStartsOn === value
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Appearance'}
      </Button>

      {status && (
        <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {status.type === 'success'
            ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **3.4** Update `src/app/(app)/settings/page.tsx` — replace Appearance tab placeholder with `<AppearanceTab>` component

Replace the entire file contents:

```typescript
// src/app/(app)/settings/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'

export default async function SettingsPage() {
  const session = await requireSession()

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
      family: {
        select: {
          id: true,
          name: true,
          umamiScriptUrl: true,
          umamiSiteId: true,
        },
      },
    },
  })

  if (!user) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="account" className="w-full max-w-2xl">
          <TabsList className="mb-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountTab user={user} />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
              initialTheme={user.theme}
              initialFontSize={user.fontSize}
              initialWeekStartsOn={user.weekStartsOn}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <div className="text-muted-foreground text-sm">Integrations — coming in Task 4.</div>
          </TabsContent>

          <TabsContent value="data">
            <div className="text-muted-foreground text-sm">Data — coming in Task 5.</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **3.5** Verify: Open `/settings` → Appearance tab → toggle theme → UI changes immediately. Check that the `<html>` element has the correct `text-sm/base/lg` class after save + reload.

**Commit:** `feat: theme system with next-themes ThemeProvider + Appearance settings tab`

---

## Task 4: Integrations Tab

**Goal:** Replace the existing Phase 1 integrations stub page with a proper tab in the Settings page. Keep Cozi import. Add Umami config (admin only).

**Files to modify:**
- `src/app/(app)/settings/integrations/page.tsx` — redirect to `/settings?tab=integrations` (or keep as fallback)
- `src/app/(app)/settings/page.tsx` — replace integrations tab placeholder

**Files to create:**
- `src/components/settings/IntegrationsTab.tsx`

### Steps

- [ ] **4.1** Create `src/components/settings/IntegrationsTab.tsx`

```typescript
// src/components/settings/IntegrationsTab.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface IntegrationsTabProps {
  isAdmin: boolean
  initialUmamiScriptUrl: string | null
  initialUmamiSiteId: string | null
}

type Status = { type: 'success' | 'error'; message: string } | null

interface ImportResult {
  success: boolean
  eventCount?: number
  message?: string
  error?: string
}

export function IntegrationsTab({ isAdmin, initialUmamiScriptUrl, initialUmamiSiteId }: IntegrationsTabProps) {
  // Cozi import
  const [icsFile, setIcsFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Umami config
  const [umamiScriptUrl, setUmamiScriptUrl] = useState(initialUmamiScriptUrl ?? '')
  const [umamiSiteId, setUmamiSiteId] = useState(initialUmamiSiteId ?? '')
  const [umamiSaving, setUmamiSaving] = useState(false)
  const [umamiStatus, setUmamiStatus] = useState<Status>(null)

  async function handleCoziImport() {
    if (!icsFile) return
    setImportLoading(true)
    setImportResult(null)

    const form = new FormData()
    form.append('ics', icsFile)

    const res = await fetch('/api/import/cozi', { method: 'POST', body: form })
    const data = await res.json()
    setImportLoading(false)

    if (!res.ok) {
      setImportResult({ success: false, error: data.error ?? 'Import failed' })
    } else {
      setImportResult({ success: true, eventCount: data.eventCount, message: data.message })
    }
  }

  async function saveUmami() {
    setUmamiSaving(true)
    setUmamiStatus(null)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          umamiScriptUrl: umamiScriptUrl.trim(),
          umamiSiteId: umamiSiteId.trim(),
        }),
      })
      if (res.ok) {
        setUmamiStatus({ type: 'success', message: 'Umami settings saved. Analytics will load on next page visit.' })
      } else {
        const data = await res.json()
        setUmamiStatus({ type: 'error', message: data.error ?? 'Failed to save.' })
      }
    } catch {
      setUmamiStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setUmamiSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cozi Import */}
      <Card>
        <CardHeader>
          <CardTitle>Import from Cozi</CardTitle>
          <CardDescription>
            Export your Cozi calendar as an .ics file and upload it here to import your events.
            Lists must be re-entered manually. This can be run again if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => document.getElementById('ics-input')?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Choose .ics file
            </Button>
            <input
              id="ics-input"
              type="file"
              accept=".ics"
              className="hidden"
              onChange={e => setIcsFile(e.target.files?.[0] ?? null)}
            />
            {icsFile && <span className="text-sm text-muted-foreground">{icsFile.name}</span>}
          </div>

          <Button onClick={handleCoziImport} disabled={!icsFile || importLoading}>
            {importLoading ? 'Importing...' : 'Import Events'}
          </Button>

          {importResult && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${importResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {importResult.success
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{importResult.success ? importResult.message : importResult.error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            How to export from Cozi: Open Cozi → Settings → Export calendar → Download .ics file.
          </p>
        </CardContent>
      </Card>

      {/* Umami Analytics — admin only */}
      <Card>
        <CardHeader>
          <CardTitle>Umami Analytics</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Admin only — configure your self-hosted Umami tracking script. Applies to all family members.'
              : 'Only admins can configure analytics. Contact your family admin.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="umami-script-url">Script URL</Label>
                <Input
                  id="umami-script-url"
                  type="url"
                  value={umamiScriptUrl}
                  onChange={e => setUmamiScriptUrl(e.target.value)}
                  placeholder="https://your-umami-instance.com/script.js"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="umami-site-id">Website ID</Label>
                <Input
                  id="umami-site-id"
                  value={umamiSiteId}
                  onChange={e => setUmamiSiteId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveUmami} disabled={umamiSaving}>
                  {umamiSaving ? 'Saving...' : 'Save Analytics Config'}
                </Button>
                {(umamiScriptUrl || umamiSiteId) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUmamiScriptUrl('')
                      setUmamiSiteId('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {umamiStatus && (
                <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${umamiStatus.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                  {umamiStatus.type === 'success'
                    ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span>{umamiStatus.message}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {initialUmamiScriptUrl
                ? 'Analytics is configured for this family.'
                : 'Analytics is not configured.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **4.2** Update `src/app/(app)/settings/page.tsx` — replace integrations tab placeholder with `<IntegrationsTab>`

Replace the full file (accumulating all tabs from previous tasks):

```typescript
// src/app/(app)/settings/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'

export default async function SettingsPage() {
  const session = await requireSession()

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
      family: {
        select: {
          id: true,
          name: true,
          umamiScriptUrl: true,
          umamiSiteId: true,
        },
      },
    },
  })

  if (!user) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="account" className="w-full max-w-2xl">
          <TabsList className="mb-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountTab user={user} />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
              initialTheme={user.theme}
              initialFontSize={user.fontSize}
              initialWeekStartsOn={user.weekStartsOn}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              isAdmin={user.role === 'admin'}
              initialUmamiScriptUrl={user.family.umamiScriptUrl}
              initialUmamiSiteId={user.family.umamiSiteId}
            />
          </TabsContent>

          <TabsContent value="data">
            <div className="text-muted-foreground text-sm">Data — coming in Task 5.</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **4.3** Update `src/app/(app)/settings/integrations/page.tsx` — redirect to new settings page (keep for backwards compatibility with any bookmarks)

```typescript
// src/app/(app)/settings/integrations/page.tsx
import { redirect } from 'next/navigation'

export default function IntegrationsRedirectPage() {
  redirect('/settings')
}
```

- [ ] **4.4** Verify: Integrations tab shows Cozi import section. Admin sees Umami fields; non-admin sees read-only message. Saving Umami settings returns success.

**Commit:** `feat: Integrations tab (Cozi import + Umami admin config)`

---

## Task 5: Data Tab

**Goal:** Implement the Data tab with export button, Cozi import history, and delete account danger zone.

**Files to create:**
- `src/components/settings/DataTab.tsx`

**Files to modify:**
- `src/app/(app)/settings/page.tsx` — replace data tab placeholder

### Steps

- [ ] **5.1** Create `src/components/settings/DataTab.tsx`

```typescript
// src/components/settings/DataTab.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Download } from 'lucide-react'

interface CoziImport {
  id: string
  importedAt: string
  importedBy: string
  eventCount: number
  listCount: number
  itemCount: number
  notes: string | null
}

interface DataTabProps {
  coziImports: CoziImport[]
  userEmail: string
}

export function DataTab({ coziImports, userEmail }: DataTabProps) {
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/export', { method: 'POST' })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `homebase-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Could show a toast here
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== userEmail) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/settings', { method: 'DELETE' })
      if (res.ok) {
        // Sign out and redirect
        router.push('/login')
      } else {
        const data = await res.json()
        setDeleteError(data.error ?? 'Failed to delete account.')
      }
    } catch {
      setDeleteError('Network error.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export Family Data</CardTitle>
          <CardDescription>
            Download all your family data as a JSON file, including events, lists, recipes, and meal plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Preparing export...' : 'Download JSON Export'}
          </Button>
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Cozi Import History</CardTitle>
          <CardDescription>Record of all Cozi calendar imports for this family.</CardDescription>
        </CardHeader>
        <CardContent>
          {coziImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="border border-border rounded-md divide-y divide-border">
              {coziImports.map(imp => (
                <div key={imp.id} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {new Date(imp.importedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">{imp.eventCount} events</span>
                  </div>
                  {imp.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{imp.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are permanent and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border border-destructive/20 rounded-lg p-4 space-y-3">
            <div>
              <h4 className="text-sm font-medium">Delete Your Account</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently removes your account. If you are the only admin, this will be blocked — promote another member first.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete My Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Your Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and remove you from the family. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Type your email address to confirm:
            </p>
            <Label htmlFor="delete-confirm" className="sr-only">Confirm email</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={userEmail}
            />
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirm !== userEmail || deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **5.2** Add `DELETE /api/settings` handler to `src/app/api/settings/route.ts`

Add the following export to the bottom of the existing file:

```typescript
// Add to src/app/api/settings/route.ts (append after PATCH export)
import { signOut } from 'next-auth'  // Note: server-side sign out not available in v5 beta directly
                                      // Instead return 200 and let client handle signOut

export async function DELETE() {
  const session = await requireSession()

  // Safety check: don't allow the last admin to delete themselves
  const adminCount = await prisma.user.count({
    where: { familyId: session.familyId, role: 'admin' },
  })

  if (adminCount === 1 && session.role === 'admin') {
    return NextResponse.json(
      {
        error:
          'You are the only admin. Promote another family member to admin before deleting your account.',
      },
      { status: 400 }
    )
  }

  await prisma.user.delete({ where: { id: session.id } })
  return NextResponse.json({ success: true })
}
```

Note: The DELETE handler returns 200. The client `DataTab` then calls `router.push('/login')`. The session cookie will be invalid on the next request because the user record no longer exists, so the middleware/auth check will redirect to login naturally. If you need an explicit sign-out, call `signOut()` from `next-auth/react` client-side after a successful DELETE response.

- [ ] **5.3** Update `src/app/(app)/settings/page.tsx` — fetch CoziImports and pass to DataTab; replace data tab placeholder

Full updated file (accumulates all 4 tabs):

```typescript
// src/app/(app)/settings/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'
import { DataTab } from '@/components/settings/DataTab'

export default async function SettingsPage() {
  const session = await requireSession()

  const [user, coziImports] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        fontSize: true,
        weekStartsOn: true,
        family: {
          select: {
            id: true,
            name: true,
            umamiScriptUrl: true,
            umamiSiteId: true,
          },
        },
      },
    }),
    prisma.coziImport.findMany({
      where: { familyId: session.familyId },
      orderBy: { importedAt: 'desc' },
      select: {
        id: true,
        importedAt: true,
        importedBy: true,
        eventCount: true,
        listCount: true,
        itemCount: true,
        notes: true,
      },
    }),
  ])

  if (!user) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="account" className="w-full max-w-2xl">
          <TabsList className="mb-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountTab user={user} />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
              initialTheme={user.theme}
              initialFontSize={user.fontSize}
              initialWeekStartsOn={user.weekStartsOn}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              isAdmin={user.role === 'admin'}
              initialUmamiScriptUrl={user.family.umamiScriptUrl}
              initialUmamiSiteId={user.family.umamiSiteId}
            />
          </TabsContent>

          <TabsContent value="data">
            <DataTab
              coziImports={coziImports.map(c => ({
                ...c,
                importedAt: c.importedAt.toISOString(),
              }))}
              userEmail={user.email}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **5.4** Verify: Data tab shows export button. Clicking downloads a JSON file. Import history shows CoziImport records. Delete account dialog requires email confirmation, blocks last admin.

**Commit:** `feat: Data tab (JSON export, Cozi import history, delete account danger zone)`

---

## Task 6: Umami Script Injection

**Goal:** Root layout reads Family.umamiScriptUrl + umamiSiteId and conditionally injects a Next.js `<Script>` tag.

**Files to modify:**
- `src/app/layout.tsx` — add Umami script injection (builds on Task 3's layout)

### Steps

- [ ] **6.1** Modify `src/app/layout.tsx` — add Umami script injection

This is the final version of the root layout, combining Task 3's ThemeProvider + fontSize with Umami script injection:

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Homebase',
  description: 'Your family hub',
}

const fontSizeClassMap: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let fontSize = 'base'
  let umamiScriptUrl: string | null = null
  let umamiSiteId: string | null = null

  try {
    const session = await auth()
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: {
          fontSize: true,
          family: {
            select: {
              umamiScriptUrl: true,
              umamiSiteId: true,
            },
          },
        },
      })
      if (user?.fontSize) fontSize = user.fontSize
      if (user?.family?.umamiScriptUrl) umamiScriptUrl = user.family.umamiScriptUrl
      if (user?.family?.umamiSiteId) umamiSiteId = user.family.umamiSiteId
    }
  } catch {
    // Not logged in or DB error — use defaults
  }

  const fontSizeClass = fontSizeClassMap[fontSize] ?? 'text-base'
  const showUmami = Boolean(umamiScriptUrl && umamiSiteId)

  return (
    <html lang="en" className={`h-full ${fontSizeClass}`} suppressHydrationWarning>
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {showUmami && (
          <Script
            src={umamiScriptUrl!}
            data-website-id={umamiSiteId!}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  )
}
```

Note: `next/script` with `strategy="afterInteractive"` loads the script after the page becomes interactive, which is the correct strategy for analytics. The script renders outside `<ThemeProvider>` but inside `<body>` which is fine.

- [ ] **6.2** Verify: In the Integrations tab (as admin), save a Umami script URL and site ID. Reload any page. Open browser DevTools → Network tab and confirm the Umami script is requested. View Page Source and confirm `<script src="..." data-website-id="...">` appears.

**Commit:** `feat: Umami analytics script injection in root layout`

---

## Task 7: Mobile Responsive Sidebar

**Goal:** Hide the sidebar on mobile, show a hamburger button that opens the sidebar in a Shadcn `Sheet` slide-in panel from the left.

**Files to modify:**
- `src/components/layout/AppShell.tsx` — add hamburger button + Sheet, hide sidebar on mobile
- `src/components/layout/Sidebar.tsx` — extract nav content into `SidebarContent` for reuse in Sheet

### Steps

- [ ] **7.1** Modify `src/components/layout/Sidebar.tsx` — split into `SidebarContent` (the nav JSX) and `Sidebar` (desktop wrapper)

```typescript
// src/components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Home, Calendar, CheckSquare, ChefHat, CalendarDays,
  Settings, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/lists', label: 'Lists', icon: CheckSquare },
  { href: '/recipes', label: 'Recipes', icon: ChefHat },
  { href: '/meal-plan', label: 'Meal Plan', icon: CalendarDays },
]

// Exported separately so it can be used inside the Sheet on mobile
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-sidebar)' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
          🏠 Homebase
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom: Settings + Sign out */}
      <div className="px-2 py-4 border-t border-border space-y-1">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )
}

// Desktop sidebar wrapper — hidden on mobile via md:flex
export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 h-full border-r border-border">
      <SidebarContent />
    </aside>
  )
}
```

- [ ] **7.2** Modify `src/components/layout/AppShell.tsx` — add mobile header with hamburger + Sheet containing `SidebarContent`

```typescript
// src/components/layout/AppShell.tsx
'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar, SidebarContent } from './Sidebar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Mobile sheet sidebar */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="p-0 w-52" showCloseButton={false}>
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="h-full">
            <SidebarContent onNavigate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Mobile top bar — visible only below md */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border md:hidden shrink-0">
          <button
            onClick={() => setSheetOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
            🏠 Homebase
          </span>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
```

Note: `AppShell` is now a Client Component (`'use client'`) because it uses `useState`. The `(app)/layout.tsx` server component still just renders `<AppShell>{children}</AppShell>` — that's fine since client components can wrap server-rendered children.

- [ ] **7.3** Verify on mobile viewport (DevTools → device toolbar → iPhone 14, 390px):
  - Desktop sidebar is hidden
  - A hamburger icon + "Homebase" text appears at the top
  - Tapping the hamburger opens the Sheet from the left with full nav
  - Tapping any nav link closes the Sheet and navigates

**Commit:** `feat: mobile responsive sidebar with hamburger menu and Sheet slide-in`

---

## Task 8: Mobile Responsive Pass

**Goal:** Apply responsive breakpoints to Dashboard, Calendar, Recipes, and Meal Plan pages.

**Files to modify:**
- `src/components/dashboard/DashboardGrid.tsx` — `grid-cols-1 md:grid-cols-2`
- `src/components/calendar/CalendarView.tsx` — responsive toolbar
- `src/components/calendar/MonthView.tsx` — smaller cell padding on mobile
- `src/components/calendar/WeekView.tsx` — horizontal scroll on mobile
- `src/app/(app)/recipes/page.tsx` — responsive recipe grid
- `src/app/(app)/meal-plan/page.tsx` — horizontal scroll on mobile

### Steps

- [ ] **8.1** Modify `src/components/dashboard/DashboardGrid.tsx` — add `grid-cols-1 md:grid-cols-2`

```typescript
// src/components/dashboard/DashboardGrid.tsx
import type { DashboardData } from '@/types'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TonightsDinnerCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'

export function DashboardGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-y-auto">
      <UpcomingEventsCard events={data.upcomingEvents} />
      <TonightsDinnerCard dinner={data.tonightsDinner} />
      <ShoppingListCard list={data.shoppingList} />
      <TodoCard todo={data.todoSummary} />
    </div>
  )
}
```

- [ ] **8.2** Modify `src/components/calendar/CalendarView.tsx` — responsive toolbar (stack on mobile, wrap view toggle)

```typescript
// src/components/calendar/CalendarView.tsx
'use client'

import { useState, useCallback } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { EventModal } from './EventModal'
import type { CalendarEvent } from '@/types'

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  weekStartsOn: 0 | 1
}

export function CalendarView({ initialEvents, weekStartsOn }: CalendarViewProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()

  const refresh = useCallback(async () => {
    const res = await fetch('/api/events')
    if (res.ok) setEvents(await res.json())
  }, [])

  function navigate(dir: 'prev' | 'next') {
    if (view === 'month') {
      setCurrentDate(d => dir === 'next' ? addMonths(d, 1) : subMonths(d, 1))
    } else {
      setCurrentDate(d => dir === 'next' ? addWeeks(d, 1) : subWeeks(d, 1))
    }
  }

  function openNew(date?: Date) {
    setSelectedEvent(null)
    setDefaultDate(date)
    setModalOpen(true)
  }

  function openEdit(event: CalendarEvent) {
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
  }

  const title = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `Week of ${format(currentDate, 'MMM d, yyyy')}`

  return (
    <div className="flex flex-col h-full p-3 md:p-4 gap-3">
      {/* Toolbar — stacks on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base md:text-lg font-semibold w-40 md:w-52 text-center truncate">{title}</h2>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Week
            </button>
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-border rounded-lg">
        {view === 'month' ? (
          <MonthView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
          />
        )}
      </div>

      <EventModal
        event={selectedEvent}
        defaultDate={defaultDate}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={refresh}
      />
    </div>
  )
}
```

- [ ] **8.3** Modify `src/components/calendar/MonthView.tsx` — smaller padding on mobile

Change the day cell `className` to use `p-0.5 md:p-1` and the day number span to use smaller sizing on mobile:

```typescript
// src/components/calendar/MonthView.tsx
'use client'

import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, format
} from 'date-fns'
import { EventBadge } from './EventBadge'
import type { CalendarEvent } from '@/types'

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function MonthView({ currentDate, events, weekStartsOn, onDayClick, onEventClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayHeaders = weekStartsOn === 0
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Abbreviate headers on mobile
  const mobileHeaders = dayHeaders.map(d => d.slice(0, 1))

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-border">
        {dayHeaders.map((d, i) => (
          <div key={d} className="py-1.5 md:py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{mobileHeaders[i]}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {days.map(day => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.start), day))
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`border-b border-r border-border p-0.5 md:p-1 flex flex-col gap-0.5 cursor-pointer hover:bg-accent/30 transition-colors overflow-hidden ${!inMonth ? 'opacity-40' : ''}`}
            >
              <span className={`text-xs font-medium self-start w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full ${today ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                {format(day, 'd')}
              </span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 2).map(e => (
                  <EventBadge key={e.id} event={e} onClick={onEventClick} />
                ))}
                {/* Show fewer events on small screens */}
                {dayEvents.length > 2 && (
                  <span className="text-xs text-muted-foreground px-0.5">+{dayEvents.length - 2}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **8.4** Modify `src/components/calendar/WeekView.tsx` — wrap entire grid in `overflow-x-auto` on mobile

```typescript
// src/components/calendar/WeekView.tsx
'use client'

import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, isSameDay, format
} from 'date-fns'
import { EventBadge } from './EventBadge'
import type { CalendarEvent } from '@/types'

interface WeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function WeekView({ currentDate, events, weekStartsOn, onDayClick, onEventClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return (
    // On mobile, allow horizontal scroll so 7-column grid doesn't crush
    <div className="flex flex-col h-full overflow-hidden">
      <div className="overflow-x-auto flex-1 flex flex-col min-w-0">
        <div className="min-w-[480px] flex flex-col h-full">
          <div className="grid grid-cols-7 border-b border-border shrink-0">
            {days.map(day => (
              <div key={day.toISOString()}
                onClick={() => onDayClick(day)}
                className={`py-2 md:py-3 text-center cursor-pointer hover:bg-accent/30 transition-colors ${isToday(day) ? 'bg-primary/10' : ''}`}>
                <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</p>
                <p className={`text-base md:text-lg font-semibold mt-0.5 mx-auto w-7 h-7 md:w-9 md:h-9 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}`}>
                  {format(day, 'd')}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-b border-border shrink-0 min-h-[2rem]">
            {days.map(day => {
              const allDay = events.filter(e => e.isAllDay && isSameDay(new Date(e.start), day))
              return (
                <div key={day.toISOString()} className="p-1 border-r border-border flex flex-col gap-0.5">
                  {allDay.map(e => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
                </div>
              )
            })}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 h-full">
              {days.map(day => {
                const timed = events
                  .filter(e => !e.isAllDay && isSameDay(new Date(e.start), day))
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                return (
                  <div key={day.toISOString()} className="border-r border-border p-1 flex flex-col gap-1">
                    {timed.map(e => (
                      <div key={e.id} className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{format(new Date(e.start), 'h:mm a')}</span>
                        <EventBadge event={e} onClick={onEventClick} />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **8.5** Modify `src/app/(app)/recipes/page.tsx` — implement a real responsive recipe grid

Note: Phase 1 left this as a stub. Phase 3 keeps it simple — just a proper grid skeleton with the right breakpoints. The real recipe data/CRUD is Phase 2 scope. If Phase 2 implemented this, update the grid class on whatever grid wrapper exists. If still a stub:

```typescript
// src/app/(app)/recipes/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChefHat } from 'lucide-react'

export default async function RecipesPage() {
  const session = await requireSession()

  const recipes = await prisma.recipe.findMany({
    where: { familyId: session.familyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      prepTime: true,
      cookTime: true,
      servings: true,
      tags: true,
    },
  })

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Recipes</h1>
          <p className="text-muted-foreground mt-1">{recipes.length} recipes</p>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
          <ChefHat className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No recipes yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map(recipe => (
            <Card key={recipe.id} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{recipe.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                )}
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {recipe.prepTime && <span>Prep: {recipe.prepTime}m</span>}
                  {recipe.cookTime && <span>Cook: {recipe.cookTime}m</span>}
                  {recipe.servings && <span>Serves {recipe.servings}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **8.6** Modify `src/app/(app)/meal-plan/page.tsx` — implement a responsive meal plan grid with horizontal scroll on mobile

```typescript
// src/app/(app)/meal-plan/page.tsx
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { MealPlanGrid } from '@/components/meal-plan/MealPlanGrid'

export default async function MealPlanPage() {
  const session = await requireSession()

  // Fetch the current week's meal plans
  const now = new Date()
  const weekStart = new Date(now)
  const dayOfWeek = session.weekStartsOn === 1
    ? (now.getDay() === 0 ? 6 : now.getDay() - 1)
    : now.getDay()
  weekStart.setDate(now.getDate() - dayOfWeek)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: session.familyId,
      date: { gte: weekStart, lt: weekEnd },
    },
    include: {
      recipe: { select: { id: true, title: true } },
    },
    orderBy: { date: 'asc' },
  })

  return (
    <MealPlanGrid
      mealPlans={mealPlans.map(mp => ({
        id: mp.id,
        date: mp.date.toISOString(),
        mealType: mp.mealType,
        note: mp.note,
        recipe: mp.recipe ? { id: mp.recipe.id, title: mp.recipe.title } : null,
      }))}
      weekStartsOn={session.weekStartsOn as 0 | 1}
      weekStart={weekStart.toISOString()}
    />
  )
}
```

- [ ] **8.7** Create `src/components/meal-plan/MealPlanGrid.tsx` — responsive 7-day grid with horizontal scroll on mobile

```typescript
// src/components/meal-plan/MealPlanGrid.tsx
'use client'

import { format, addDays } from 'date-fns'

interface MealPlan {
  id: string
  date: string
  mealType: string
  note: string | null
  recipe: { id: string; title: string } | null
}

interface MealPlanGridProps {
  mealPlans: MealPlan[]
  weekStartsOn: 0 | 1
  weekStart: string
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

export function MealPlanGrid({ mealPlans, weekStart }: MealPlanGridProps) {
  const start = new Date(weekStart)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  function getMeals(day: Date, mealType: string) {
    return mealPlans.filter(mp => {
      const mpDate = new Date(mp.date)
      return (
        mpDate.toDateString() === day.toDateString() &&
        mp.mealType === mealType
      )
    })
  }

  return (
    <div className="flex flex-col h-full p-4 md:p-6 overflow-hidden">
      <h1 className="text-2xl font-bold mb-4 shrink-0">Meal Plan</h1>

      {/* Horizontal scroll on mobile for the 7-column grid */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[600px] h-full flex flex-col">
          {/* Day headers */}
          <div className="grid grid-cols-8 border border-border rounded-t-lg overflow-hidden">
            <div className="py-2 px-2 bg-muted text-xs font-medium text-muted-foreground border-r border-border" />
            {days.map(day => (
              <div
                key={day.toISOString()}
                className="py-2 px-1 text-center bg-muted border-r border-border last:border-r-0"
              >
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {format(day, 'EEE')}
                </p>
                <p className="text-sm font-semibold">{format(day, 'd')}</p>
              </div>
            ))}
          </div>

          {/* Meal type rows */}
          <div className="border-x border-b border-border rounded-b-lg overflow-hidden flex-1">
            {MEAL_TYPES.map((mealType, idx) => (
              <div
                key={mealType}
                className={`grid grid-cols-8 ${idx < MEAL_TYPES.length - 1 ? 'border-b border-border' : ''}`}
              >
                {/* Meal type label */}
                <div className="py-3 px-2 border-r border-border flex items-start">
                  <span className="text-xs font-medium text-muted-foreground capitalize">{mealType}</span>
                </div>

                {/* Day cells */}
                {days.map(day => {
                  const dayMeals = getMeals(day, mealType)
                  return (
                    <div
                      key={day.toISOString()}
                      className="py-2 px-1 border-r border-border last:border-r-0 min-h-[60px] hover:bg-accent/20 transition-colors cursor-pointer"
                    >
                      {dayMeals.map(meal => (
                        <div key={meal.id} className="text-xs p-1 rounded bg-primary/10 text-primary mb-1 truncate">
                          {meal.recipe?.title ?? meal.note ?? 'Meal'}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **8.8** Verify on mobile viewport (390px iPhone 14):
  - Dashboard: 1-column stack
  - Calendar month: abbreviated day headers, smaller cells
  - Calendar week: horizontally scrollable
  - Recipes: 1-column grid
  - Meal plan: horizontally scrollable 7-day grid

**Commit:** `feat: mobile responsive pass on dashboard, calendar, recipes, and meal plan`

---

## Summary of Files Changed

| Task | Files Created | Files Modified |
|------|--------------|----------------|
| 1 | `api/settings/route.ts`, `api/settings/family/route.ts`, `api/family/members/route.ts`, `api/export/route.ts`, 2 test files | — |
| 2 | `components/settings/AccountTab.tsx` | `app/(app)/settings/page.tsx`, `components/layout/Sidebar.tsx` |
| 3 | `components/settings/AppearanceTab.tsx`, `components/providers/ThemeProvider.tsx` | `app/layout.tsx`, `app/(app)/settings/page.tsx` |
| 4 | `components/settings/IntegrationsTab.tsx` | `app/(app)/settings/page.tsx`, `app/(app)/settings/integrations/page.tsx` |
| 5 | `components/settings/DataTab.tsx` | `app/api/settings/route.ts` (add DELETE), `app/(app)/settings/page.tsx` |
| 6 | — | `app/layout.tsx` |
| 7 | — | `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx` |
| 8 | `components/meal-plan/MealPlanGrid.tsx` | `components/dashboard/DashboardGrid.tsx`, `components/calendar/CalendarView.tsx`, `components/calendar/MonthView.tsx`, `components/calendar/WeekView.tsx`, `app/(app)/recipes/page.tsx`, `app/(app)/meal-plan/page.tsx` |

## Commit Order

1. `feat: settings + export API routes (GET/PATCH /api/settings, PATCH /api/settings/family, GET /api/family/members, POST /api/export)`
2. `feat: settings page scaffold + Account tab (name, password, family name, invite codes, members list)`
3. `feat: theme system with next-themes ThemeProvider + Appearance settings tab`
4. `feat: Integrations tab (Cozi import + Umami admin config)`
5. `feat: Data tab (JSON export, Cozi import history, delete account danger zone)`
6. `feat: Umami analytics script injection in root layout`
7. `feat: mobile responsive sidebar with hamburger menu and Sheet slide-in`
8. `feat: mobile responsive pass on dashboard, calendar, recipes, and meal plan`
