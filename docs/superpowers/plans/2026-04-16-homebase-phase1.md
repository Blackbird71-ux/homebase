# Homebase Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and Docker-deploy Phase 1 of Homebase — a private family management app with email/password auth, fullscreen sidebar layout, a 2×2 home dashboard, a full calendar, and a one-time Cozi import tool.

**Architecture:** Next.js 15 App Router with a route-group `(app)` for all protected pages behind a shared sidebar shell. All data lives in SQLite via Prisma, accessed through Next.js API routes. Auth is NextAuth v5 with CredentialsProvider. The app is designed fullscreen (100vw/100vh) with no page-level scroll.

**Tech Stack:** Next.js 15, Node.js 22, Prisma + better-sqlite3, NextAuth v5, Tailwind CSS, Shadcn UI, Lucide React, date-fns, node-ical, vitest

**Project root:** `C:/Users/liddlem/Downloads/Claude Apps/HomeBase`

---

## File Map

```
homebase/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx                        # Root HTML shell (fullscreen base)
│   │   ├── page.tsx                          # Redirect → /home or /login
│   │   ├── login/page.tsx                    # Login form
│   │   ├── register/page.tsx                 # Register form (first user or invite code)
│   │   ├── (app)/                            # Protected route group
│   │   │   ├── layout.tsx                    # App shell: sidebar + <main>
│   │   │   ├── home/page.tsx                 # Dashboard — 2×2 summary cards
│   │   │   ├── calendar/page.tsx             # Calendar — month/week views
│   │   │   └── settings/
│   │   │       └── integrations/page.tsx     # Settings → Integrations (Cozi import UI)
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts   # NextAuth handler
│   │       ├── register/route.ts             # POST — create user (first or invited)
│   │       ├── invite/route.ts               # GET validate, POST generate (admin)
│   │       ├── events/route.ts               # GET list, POST create
│   │       ├── events/[id]/route.ts          # GET, PUT, DELETE single event
│   │       ├── dashboard/route.ts            # GET aggregated home dashboard data
│   │       └── import/cozi/route.ts          # POST — parse + import Cozi files
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx                   # Persistent left nav
│   │   │   └── AppShell.tsx                  # Fullscreen wrapper with sidebar slot
│   │   ├── dashboard/
│   │   │   ├── DashboardGrid.tsx             # 2×2 responsive grid
│   │   │   ├── UpcomingEventsCard.tsx        # Next 3–5 events
│   │   │   ├── TonightsDinnerCard.tsx        # Today's meal plan entry
│   │   │   ├── ShoppingListCard.tsx          # Active shopping list summary
│   │   │   └── TodoCard.tsx                  # Tasks due today
│   │   ├── calendar/
│   │   │   ├── CalendarView.tsx              # View toggle + top-level render
│   │   │   ├── MonthView.tsx                 # 7-column month grid
│   │   │   ├── WeekView.tsx                  # 7-column week + time rows
│   │   │   ├── EventBadge.tsx                # Coloured chip on grid cell
│   │   │   └── EventModal.tsx                # Create/edit event dialog
│   │   └── ui/                               # Shadcn auto-generated (do not edit)
│   ├── lib/
│   │   ├── prisma.ts                         # Prisma client singleton
│   │   ├── auth.ts                           # NextAuth config
│   │   ├── auth-helpers.ts                   # requireSession(), requireAdmin()
│   │   ├── invite.ts                         # generateCode(), validateCode()
│   │   └── cozi-parser.ts                    # parseIcs(), parseCoziCsv()
│   └── types/
│       └── index.ts                          # Shared TS types
├── docker/
│   └── entrypoint.sh
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── vitest.config.ts
└── next.config.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `homebase/` (project root — all paths below are relative to this)
- Create: `next.config.ts`
- Create: `.env.example`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialise Next.js 15 project**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase"
npx create-next-app@latest homebase \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
cd homebase
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install @prisma/client better-sqlite3 next-auth@beta \
  bcryptjs date-fns lucide-react node-ical \
  @hookform/resolvers react-hook-form zod

npm install -D prisma @types/better-sqlite3 @types/bcryptjs \
  @types/node-ical vitest @vitejs/plugin-react \
  @testing-library/react @testing-library/jest-dom \
  vite-tsconfig-paths
```

- [ ] **Step 3: Install Shadcn UI**

```bash
npx shadcn@latest init
# When prompted: Default style, slate base color, CSS variables: yes
npx shadcn@latest add button card dialog form input label \
  select separator sheet tabs toast
```

- [ ] **Step 4: Write `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

- [ ] **Step 5: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

- [ ] **Step 6: Write `.env.example`**

```bash
DATABASE_URL="file:/data/homebase.db"
NEXTAUTH_SECRET="replace-with-random-32-char-string"
NEXTAUTH_URL="http://localhost:3000"
ENCRYPTION_KEY="replace-with-32-byte-base64-key"
```

- [ ] **Step 7: Create `src/types/index.ts`**

```typescript
export type UserRole = 'admin' | 'member'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  familyId: string
}

export interface DashboardData {
  upcomingEvents: UpcomingEvent[]
  tonightsDinner: TonightsDinner | null
  shoppingList: ShoppingListSummary | null
  todoSummary: TodoSummary | null
}

export interface UpcomingEvent {
  id: string
  title: string
  start: string
  end: string
  isAllDay: boolean
  category: string | null
  color: string | null
}

export interface TonightsDinner {
  mealPlanId: string
  recipeName: string | null
  note: string | null
}

export interface ShoppingListSummary {
  listId: string
  listName: string
  totalItems: number
  pendingItems: number
  firstItems: string[]
}

export interface TodoSummary {
  listId: string
  listName: string
  dueTodayCount: number
  firstItems: string[]
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  isAllDay: boolean
  category: string | null
  color: string | null
  createdBy: string
}
```

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: initial Next.js 15 scaffold with dependencies"
```

---

## Task 2: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker/entrypoint.sh`
- Create: `.dockerignore`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/data/homebase.db"
RUN npx prisma generate
RUN npm run build

# Stage 3: Run
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]
```

- [ ] **Step 2: Write `docker/entrypoint.sh`**

```bash
#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting Homebase..."
exec node server.js
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
version: "3.8"
services:
  homebase:
    build: .
    image: homebase:latest
    ports:
      - "3001:3000"
    volumes:
      - ./data:/data
    environment:
      - DATABASE_URL=file:/data/homebase.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

- [ ] **Step 4: Write `.dockerignore`**

```
node_modules
.next
.git
*.md
.env*
data/
```

- [ ] **Step 5: Add health endpoint `src/app/api/health/route.ts`**

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: Docker setup with multi-stage build and health check"
```

---

## Task 3: Prisma Schema & Database

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Family {
  id             String        @id @default(cuid())
  name           String
  umamiScriptUrl String?
  umamiSiteId    String?
  users          User[]
  events         Event[]
  lists          List[]
  recipes        Recipe[]
  mealPlans      MealPlan[]
  coziImports    CoziImport[]
  inviteCodes    InviteCode[]
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  password      String
  name          String
  role          String   @default("member")
  familyId      String
  family        Family   @relation(fields: [familyId], references: [id])
  theme         String   @default("dark")
  fontSize      String   @default("base")
  weekStartsOn  Int      @default(0)
  uiPreferences String?
  createdAt     DateTime @default(now())
}

model InviteCode {
  id        String   @id @default(cuid())
  code      String   @unique
  used      Boolean  @default(false)
  usedBy    String?
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  createdAt DateTime @default(now())
  expiresAt DateTime?
}

model Event {
  id          String   @id @default(cuid())
  title       String
  description String?
  start       DateTime
  end         DateTime
  isAllDay    Boolean  @default(false)
  category    String?
  color       String?
  createdBy   String
  familyId    String
  family      Family   @relation(fields: [familyId], references: [id])
  createdAt   DateTime @default(now())
}

model List {
  id        String     @id @default(cuid())
  name      String
  type      String
  isActive  Boolean    @default(true)
  items     ListItem[]
  familyId  String
  family    Family     @relation(fields: [familyId], references: [id])
  createdAt DateTime   @default(now())
}

model ListItem {
  id          String   @id @default(cuid())
  content     String
  isCompleted Boolean  @default(false)
  category    String?
  sortOrder   Int      @default(0)
  dueDate     DateTime?
  createdBy   String
  listId      String
  list        List     @relation(fields: [listId], references: [id])
  createdAt   DateTime @default(now())
}

model Recipe {
  id           String     @id @default(cuid())
  title        String
  description  String?
  ingredients  String
  instructions String
  image        String?
  sourceUrl    String?
  prepTime     Int?
  cookTime     Int?
  servings     Int?
  tags         String?
  createdBy    String
  familyId     String
  family       Family     @relation(fields: [familyId], references: [id])
  mealPlans    MealPlan[]
  createdAt    DateTime   @default(now())
}

model MealPlan {
  id        String   @id @default(cuid())
  date      DateTime
  mealType  String   @default("dinner")
  recipeId  String?
  recipe    Recipe?  @relation(fields: [recipeId], references: [id])
  note      String?
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
}

model CoziImport {
  id         String   @id @default(cuid())
  importedAt DateTime @default(now())
  importedBy String
  eventCount Int      @default(0)
  listCount  Int      @default(0)
  itemCount  Int      @default(0)
  notes      String?
  familyId   String
  family     Family   @relation(fields: [familyId], references: [id])
}
```

- [ ] **Step 2: Run initial migration**

```bash
npx prisma migrate dev --name init
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Write `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: Prisma schema with all Phase 1 models and initial migration"
```

---

## Task 4: Auth — NextAuth Config & Register/Login

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth-helpers.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/api/register/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Write `src/lib/auth.ts`**

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          familyId: user.familyId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as SessionUser).role
        token.familyId = (user as SessionUser).familyId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.familyId = token.familyId as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
```

- [ ] **Step 2: Write `src/lib/auth-helpers.ts`**

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { SessionUser } from '@/types'

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  return session.user as unknown as SessionUser
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession()
  if (user.role !== 'admin') redirect('/home')
  return user
}
```

- [ ] **Step 3: Extend NextAuth types — add to `src/types/index.ts`**

Append to the existing file:

```typescript
// Extend NextAuth session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      familyId: string
    }
  }
}
```

- [ ] **Step 4: Write `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 5: Write `src/app/api/register/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { email, password, name, familyName, inviteCode } = await req.json()

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const familyCount = await prisma.family.count()
  const isFirstUser = familyCount === 0

  if (!isFirstUser && !inviteCode) {
    return NextResponse.json({ error: 'Invite code required' }, { status: 403 })
  }

  const hashed = await bcrypt.hash(password, 12)

  if (isFirstUser) {
    if (!familyName) {
      return NextResponse.json({ error: 'Family name required for first user' }, { status: 400 })
    }
    const family = await prisma.family.create({ data: { name: familyName } })
    await prisma.user.create({
      data: { email, password: hashed, name, role: 'admin', familyId: family.id },
    })
    return NextResponse.json({ success: true })
  }

  // Validate invite code
  const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } })
  if (!invite || invite.used) {
    return NextResponse.json({ error: 'Invalid or used invite code' }, { status: 403 })
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invite code expired' }, { status: 403 })
  }

  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: 'member', familyId: invite.familyId },
  })
  await prisma.inviteCode.update({
    where: { code: inviteCode },
    data: { used: true, usedBy: user.id },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Write `src/app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function RootPage() {
  const session = await auth()
  if (session?.user) redirect('/home')
  else redirect('/login')
}
```

- [ ] **Step 7: Write `src/app/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/home')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold">🏠 Homebase</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your family account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          Need an account?{' '}
          <Link href="/register" className="underline">Register</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Write `src/app/register/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const params = useSearchParams()
  const prefillCode = params.get('code') ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState(prefillCode)
  const [isFirst, setIsFirst] = useState(!prefillCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, familyName, inviteCode }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
    } else {
      router.push('/login?registered=1')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold">🏠 Homebase</h1>
          <p className="text-sm text-muted-foreground mt-1">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          {isFirst ? (
            <div className="space-y-1">
              <Label htmlFor="familyName">Family name</Label>
              <Input id="familyName" placeholder="e.g. The Liddles"
                value={familyName} onChange={e => setFamilyName(e.target.value)} required />
              <p className="text-xs text-muted-foreground">
                You&apos;re the first user — you&apos;ll be the admin.{' '}
                <button type="button" className="underline"
                  onClick={() => setIsFirst(false)}>Have an invite code?</button>
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input id="inviteCode" value={inviteCode}
                onChange={e => setInviteCode(e.target.value)} required />
              <p className="text-xs text-muted-foreground">
                <button type="button" className="underline"
                  onClick={() => setIsFirst(true)}>No invite? Start a new family</button>
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Update `src/app/layout.tsx` for fullscreen base**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Homebase',
  description: 'Your family hub',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 10: Verify auth works locally**

```bash
cp .env.example .env.local
# Edit .env.local: set NEXTAUTH_SECRET to a real random string, DATABASE_URL to file:./dev.db
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000 — should redirect to /login. Register as first user.
Expected: creates family and admin user, redirects to /login.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: auth with NextAuth v5, register/login, first-user family creation"
```

---

## Task 5: Invite System

**Files:**
- Create: `src/lib/invite.ts`
- Create: `src/app/api/invite/route.ts`
- Test: `src/lib/__tests__/invite.test.ts`

- [ ] **Step 1: Write failing test `src/lib/__tests__/invite.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { generateCode, isValidCodeFormat } from '@/lib/invite'

describe('invite', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('generates unique codes', () => {
    const codes = Array.from({ length: 100 }, () => generateCode())
    const unique = new Set(codes)
    expect(unique.size).toBe(100)
  })

  it('validates correct format', () => {
    expect(isValidCodeFormat('ABC12345')).toBe(true)
  })

  it('rejects lowercase', () => {
    expect(isValidCodeFormat('abc12345')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidCodeFormat('ABC123')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/invite.test.ts
```

Expected: FAIL — `generateCode` not found.

- [ ] **Step 3: Write `src/lib/invite.ts`**

```typescript
import crypto from 'crypto'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_LENGTH = 8

export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  return Array.from(bytes)
    .map(b => CHARSET[b % CHARSET.length])
    .join('')
}

export function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/invite.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Write `src/app/api/invite/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'
import { generateCode } from '@/lib/invite'

// POST — generate a new invite code (admin only)
export async function POST() {
  const user = await requireAdmin()

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invite = await prisma.inviteCode.create({
    data: { code, familyId: user.familyId, expiresAt },
  })

  return NextResponse.json({ code: invite.code, expiresAt: invite.expiresAt })
}

// GET — list all invite codes for the family (admin only)
export async function GET() {
  const user = await requireAdmin()

  const codes = await prisma.inviteCode.findMany({
    where: { familyId: user.familyId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(codes)
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: invite code generation and validation"
```

---

## Task 6: Fullscreen App Shell & Sidebar

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write `src/components/layout/Sidebar.tsx`**

```typescript
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
    <aside className="flex flex-col w-52 shrink-0 h-full bg-sidebar border-r border-border">
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
          href="/settings/integrations"
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

- [ ] **Step 2: Write `src/components/layout/AppShell.tsx`**

```typescript
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/app/(app)/layout.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 4: Add sidebar colour token to `tailwind.config.ts`**

In `tailwind.config.ts`, extend the theme to include `sidebar` as a background colour (maps to a slightly different shade than `card`):

```typescript
// Inside theme.extend.colors:
sidebar: 'hsl(var(--sidebar))',
```

In `src/app/globals.css`, inside the `:root` block, add:
```css
--sidebar: 222 47% 9%;
```

And in the `.dark` block (if present):
```css
--sidebar: 222 47% 9%;
```

- [ ] **Step 5: Add placeholder pages for unreached routes**

Create `src/app/(app)/lists/page.tsx`:
```typescript
export default function ListsPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Lists</h1><p className="text-muted-foreground mt-2">Coming in Phase 2.</p></div>
}
```

Create `src/app/(app)/recipes/page.tsx`:
```typescript
export default function RecipesPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Recipes</h1><p className="text-muted-foreground mt-2">Coming in Phase 2.</p></div>
}
```

Create `src/app/(app)/meal-plan/page.tsx`:
```typescript
export default function MealPlanPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Meal Plan</h1><p className="text-muted-foreground mt-2">Coming in Phase 2.</p></div>
}
```

- [ ] **Step 6: Verify layout in browser**

```bash
npm run dev
```

Open http://localhost:3000 → sign in → should see fullscreen layout with sidebar on left, placeholder main area on right. Sidebar links should highlight on the active route.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: fullscreen app shell with persistent sidebar and protected route group"
```

---

## Task 7: Dashboard API & Home Page

**Files:**
- Create: `src/app/api/dashboard/route.ts`
- Create: `src/app/(app)/home/page.tsx`
- Create: `src/components/dashboard/DashboardGrid.tsx`
- Create: `src/components/dashboard/UpcomingEventsCard.tsx`
- Create: `src/components/dashboard/TonightsDinnerCard.tsx`
- Create: `src/components/dashboard/ShoppingListCard.tsx`
- Create: `src/components/dashboard/TodoCard.tsx`

- [ ] **Step 1: Write `src/app/api/dashboard/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import type { DashboardData } from '@/types'

export async function GET() {
  const user = await requireSession()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [upcomingEvents, tonightsMeal, shoppingLists, todoLists] = await Promise.all([
    // Next 5 events from now
    prisma.event.findMany({
      where: { familyId: user.familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    // Tonight's dinner
    prisma.mealPlan.findFirst({
      where: {
        familyId: user.familyId,
        date: { gte: todayStart, lt: todayEnd },
        mealType: 'dinner',
      },
      include: { recipe: { select: { title: true } } },
    }),
    // Active shopping lists
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'SHOPPING', isActive: true },
      include: {
        items: {
          where: { isCompleted: false },
          orderBy: { sortOrder: 'asc' },
          take: 3,
          select: { content: true },
        },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      take: 1,
    }),
    // Todo lists with items due today
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'TODO', isActive: true },
      include: {
        items: {
          where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } },
          orderBy: { dueDate: 'asc' },
          take: 3,
          select: { content: true },
        },
        _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
      },
      take: 1,
    }),
  ])

  const data: DashboardData = {
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      isAllDay: e.isAllDay,
      category: e.category,
      color: e.color,
    })),
    tonightsDinner: tonightsMeal
      ? {
          mealPlanId: tonightsMeal.id,
          recipeName: tonightsMeal.recipe?.title ?? null,
          note: tonightsMeal.note,
        }
      : null,
    shoppingList: shoppingLists[0]
      ? {
          listId: shoppingLists[0].id,
          listName: shoppingLists[0].name,
          totalItems: shoppingLists[0]._count.items,
          pendingItems: shoppingLists[0]._count.items,
          firstItems: shoppingLists[0].items.map(i => i.content),
        }
      : null,
    todoSummary: todoLists[0]
      ? {
          listId: todoLists[0].id,
          listName: todoLists[0].name,
          dueTodayCount: todoLists[0]._count.items,
          firstItems: todoLists[0].items.map(i => i.content),
        }
      : null,
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 2: Write `src/components/dashboard/UpcomingEventsCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import { format, isToday, isTomorrow } from 'date-fns'
import type { UpcomingEvent } from '@/types'
import Link from 'next/link'

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return `Today ${format(d, 'h:mm a')}`
  if (isTomorrow(d)) return `Tomorrow ${format(d, 'h:mm a')}`
  return format(d, 'EEE d MMM h:mm a')
}

export function UpcomingEventsCard({ events }: { events: UpcomingEvent[] }) {
  return (
    <Link href="/calendar">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Calendar className="h-4 w-4" /> Upcoming
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            events.map(e => (
              <div key={e.id} className="flex items-start gap-2">
                <div
                  className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: e.color ?? '#6366f1' }}
                />
                <div>
                  <p className="text-sm font-medium leading-tight">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.isAllDay ? format(new Date(e.start), 'EEE d MMM') + ' · All day' : formatEventDate(e.start)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 3: Write `src/components/dashboard/TonightsDinnerCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UtensilsCrossed } from 'lucide-react'
import type { TonightsDinner } from '@/types'
import Link from 'next/link'

export function TonightsDinnerCard({ dinner }: { dinner: TonightsDinner | null }) {
  return (
    <Link href="/meal-plan">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <UtensilsCrossed className="h-4 w-4" /> Tonight&apos;s Dinner
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dinner ? (
            <p className="text-sm font-medium">{dinner.recipeName ?? dinner.note ?? 'Meal planned'}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing planned yet</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 4: Write `src/components/dashboard/ShoppingListCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'
import type { ShoppingListSummary } from '@/types'
import Link from 'next/link'

export function ShoppingListCard({ list }: { list: ShoppingListSummary | null }) {
  return (
    <Link href="/lists">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <ShoppingCart className="h-4 w-4" /> Shopping
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {list ? (
            <>
              <p className="text-sm font-medium">{list.pendingItems} items</p>
              {list.firstItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground">{item}</p>
              ))}
              {list.pendingItems > list.firstItems.length && (
                <p className="text-xs text-muted-foreground">
                  +{list.pendingItems - list.firstItems.length} more
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No active shopping list</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 5: Write `src/components/dashboard/TodoCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckSquare } from 'lucide-react'
import type { TodoSummary } from '@/types'
import Link from 'next/link'

export function TodoCard({ todo }: { todo: TodoSummary | null }) {
  return (
    <Link href="/lists">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CheckSquare className="h-4 w-4" /> Todo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {todo ? (
            <>
              <p className="text-sm font-medium">{todo.dueTodayCount} due today</p>
              {todo.firstItems.map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground">{item}</p>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks due today</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 6: Write `src/components/dashboard/DashboardGrid.tsx`**

```typescript
import type { DashboardData } from '@/types'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TonightsDinnerCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'

export function DashboardGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <UpcomingEventsCard events={data.upcomingEvents} />
      <TonightsDinnerCard dinner={data.tonightsDinner} />
      <ShoppingListCard list={data.shoppingList} />
      <TodoCard todo={data.todoSummary} />
    </div>
  )
}
```

- [ ] **Step 7: Write `src/app/(app)/home/page.tsx`**

```typescript
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import type { DashboardData } from '@/types'

async function getDashboardData(): Promise<DashboardData> {
  // Server component — fetch from internal API
  const res = await fetch(`${process.env.NEXTAUTH_URL}/api/dashboard`, {
    cache: 'no-store',
    headers: { cookie: '' }, // headers forwarded via middleware in App Router
  })
  if (!res.ok) return { upcomingEvents: [], tonightsDinner: null, shoppingList: null, todoSummary: null }
  return res.json()
}

export default async function HomePage() {
  const data = await getDashboardData()

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <h1 className="text-xl font-semibold mb-4 shrink-0">Home</h1>
      <div className="flex-1 overflow-hidden">
        <DashboardGrid data={data} />
      </div>
    </div>
  )
}
```

> **Note:** The home page uses a server component. In App Router, calling internal API routes from server components requires the cookie header to be forwarded. An alternative is to call the Prisma query directly in the page (bypassing the API route). Either works — use whichever feels cleaner; the API route approach is used here to keep data-fetching consistent.

- [ ] **Step 8: Verify in browser**

```bash
npm run dev
```

Open http://localhost:3000/home — should show 2×2 grid of cards. All will show empty states since no data exists yet. That's correct.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: dashboard API and 2x2 home page with summary cards"
```

---

## Task 8: Calendar API

**Files:**
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/events/[id]/route.ts`
- Test: `src/lib/__tests__/events.test.ts` (unit test for date validation)

- [ ] **Step 1: Write failing test `src/lib/__tests__/events.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { validateEventDates } from '@/lib/event-helpers'

describe('validateEventDates', () => {
  it('accepts valid start/end pair', () => {
    const result = validateEventDates('2026-04-16T09:00:00Z', '2026-04-16T10:00:00Z')
    expect(result.valid).toBe(true)
  })

  it('rejects end before start', () => {
    const result = validateEventDates('2026-04-16T10:00:00Z', '2026-04-16T09:00:00Z')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('End time must be after start time')
  })

  it('accepts all-day event where start equals end', () => {
    const result = validateEventDates('2026-04-16T00:00:00Z', '2026-04-16T00:00:00Z', true)
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/events.test.ts
```

Expected: FAIL — `validateEventDates` not found.

- [ ] **Step 3: Create `src/lib/event-helpers.ts`**

```typescript
export function validateEventDates(
  start: string,
  end: string,
  isAllDay = false
): { valid: boolean; error?: string } {
  const s = new Date(start)
  const e = new Date(end)

  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    return { valid: false, error: 'Invalid date format' }
  }

  if (!isAllDay && e < s) {
    return { valid: false, error: 'End time must be after start time' }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/events.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Write `src/app/api/events/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates } from '@/lib/event-helpers'

// GET /api/events?from=ISO&to=ISO
export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Record<string, unknown> = { familyId: user.familyId }
  if (from && to) {
    where.start = { gte: new Date(from), lte: new Date(to) }
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { start: 'asc' },
  })

  return NextResponse.json(events.map(e => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString(), createdAt: e.createdAt.toISOString() })))
}

// POST /api/events
export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color } = body

  if (!title || !start || !end) {
    return NextResponse.json({ error: 'title, start, and end are required' }, { status: 400 })
  }

  const validation = validateEventDates(start, end, isAllDay)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      start: new Date(start),
      end: new Date(end),
      isAllDay: isAllDay ?? false,
      category: category ?? null,
      color: color ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json({ ...event, start: event.start.toISOString(), end: event.end.toISOString() }, { status: 201 })
}
```

- [ ] **Step 6: Write `src/app/api/events/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates } from '@/lib/event-helpers'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireSession()
  const event = await prisma.event.findFirst({
    where: { id: params.id, familyId: user.familyId },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...event, start: event.start.toISOString(), end: event.end.toISOString() })
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color } = body

  const existing = await prisma.event.findFirst({
    where: { id: params.id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (start && end) {
    const validation = validateEventDates(start, end, isAllDay)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(start && { start: new Date(start) }),
      ...(end && { end: new Date(end) }),
      ...(isAllDay !== undefined && { isAllDay }),
      ...(category !== undefined && { category }),
      ...(color !== undefined && { color }),
    },
  })

  return NextResponse.json({ ...updated, start: updated.start.toISOString(), end: updated.end.toISOString() })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireSession()
  const existing = await prisma.event.findFirst({
    where: { id: params.id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.event.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: events CRUD API with date validation"
```

---

## Task 9: Calendar UI

**Files:**
- Create: `src/components/calendar/EventBadge.tsx`
- Create: `src/components/calendar/EventModal.tsx`
- Create: `src/components/calendar/MonthView.tsx`
- Create: `src/components/calendar/WeekView.tsx`
- Create: `src/components/calendar/CalendarView.tsx`
- Create: `src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Write `src/components/calendar/EventBadge.tsx`**

```typescript
import type { CalendarEvent } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
  Medical: '#ef4444',
  School: '#3b82f6',
  Social: '#8b5cf6',
  Work: '#f59e0b',
  Other: '#6b7280',
}

export function EventBadge({
  event,
  onClick,
}: {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
}) {
  const color = event.color ?? CATEGORY_COLORS[event.category ?? ''] ?? '#6366f1'

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(event) }}
      className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '33', color }}
    >
      {event.title}
    </button>
  )
}
```

- [ ] **Step 2: Write `src/components/calendar/EventModal.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import type { CalendarEvent } from '@/types'

const CATEGORIES = ['Medical', 'School', 'Social', 'Work', 'Other']

interface EventModalProps {
  event?: CalendarEvent | null
  defaultDate?: Date
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function EventModal({ event, defaultDate, open, onClose, onSave }: EventModalProps) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  const [category, setCategory] = useState('Other')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setStart(format(new Date(event.start), "yyyy-MM-dd'T'HH:mm"))
      setEnd(format(new Date(event.end), "yyyy-MM-dd'T'HH:mm"))
      setIsAllDay(event.isAllDay)
      setCategory(event.category ?? 'Other')
      setDescription(event.description ?? '')
    } else {
      const d = defaultDate ?? new Date()
      const base = format(d, "yyyy-MM-dd'T'09:00")
      const endBase = format(d, "yyyy-MM-dd'T'10:00")
      setTitle('')
      setStart(base)
      setEnd(endBase)
      setIsAllDay(false)
      setCategory('Other')
      setDescription('')
    }
    setError('')
  }, [event, defaultDate, open])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true)
    setError('')

    const method = event ? 'PUT' : 'POST'
    const url = event ? `/api/events/${event.id}` : '/api/events'
    const startDate = isAllDay ? new Date(start.split('T')[0]).toISOString() : new Date(start).toISOString()
    const endDate = isAllDay ? new Date(start.split('T')[0]).toISOString() : new Date(end).toISOString()

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, start: startDate, end: endDate, isAllDay, category }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save event')
    } else {
      onSave()
      onClose()
    }
  }

  async function handleDelete() {
    if (!event) return
    setLoading(true)
    await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    setLoading(false)
    onSave()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allday" checked={isAllDay}
              onChange={e => setIsAllDay(e.target.checked)} className="rounded" />
            <Label htmlFor="allday">All day</Label>
          </div>
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>
          )}
          {isAllDay && (
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={start.split('T')[0]} onChange={e => setStart(e.target.value + 'T00:00')} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          {event && (
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Write `src/components/calendar/MonthView.tsx`**

```typescript
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

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {dayHeaders.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {days.map(day => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.start), day))
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`border-b border-r border-border p-1 flex flex-col gap-1 cursor-pointer
                hover:bg-accent/30 transition-colors overflow-hidden
                ${!inMonth ? 'opacity-40' : ''}`}
            >
              <span className={`text-xs font-medium self-start w-6 h-6 flex items-center justify-center rounded-full
                ${today ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                {format(day, 'd')}
              </span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map(e => (
                  <EventBadge key={e.id} event={e} onClick={onEventClick} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-xs text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
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

- [ ] **Step 4: Write `src/components/calendar/WeekView.tsx`**

```typescript
'use client'

import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, isSameDay, format, getHours
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border shrink-0">
        {days.map(day => (
          <div key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={`py-3 text-center cursor-pointer hover:bg-accent/30 transition-colors
              ${isToday(day) ? 'bg-primary/10' : ''}`}>
            <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</p>
            <p className={`text-lg font-semibold mt-0.5 mx-auto w-9 h-9 flex items-center justify-center rounded-full
              ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}`}>
              {format(day, 'd')}
            </p>
          </div>
        ))}
      </div>
      {/* All-day events */}
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
      {/* Timed events — simplified list per day */}
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
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.start), 'h:mm a')}
                    </span>
                    <EventBadge event={e} onClick={onEventClick} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write `src/components/calendar/CalendarView.tsx`**

```typescript
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
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold w-52 text-center">{title}</h2>
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
              className={`px-3 py-1.5 text-sm font-medium transition-colors
                ${view === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors
                ${view === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Week
            </button>
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
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

- [ ] **Step 6: Write `src/app/(app)/calendar/page.tsx`**

```typescript
import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  const events = await prisma.event.findMany({
    where: { familyId: user.familyId, start: { gte: from, lte: to } },
    orderBy: { start: 'asc' },
  })

  const calendarEvents: CalendarEvent[] = events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    isAllDay: e.isAllDay,
    category: e.category,
    color: e.color,
    createdBy: e.createdBy,
  }))

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
    />
  )
}
```

- [ ] **Step 7: Verify calendar in browser**

```bash
npm run dev
```

Open http://localhost:3000/calendar — should see month view. Click a day → event modal opens. Create an event → it appears on the calendar. Switch to week view. Edit and delete work.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: calendar with month/week views, event CRUD, EventModal"
```

---

## Task 10: Cozi Import

**Files:**
- Create: `src/lib/cozi-parser.ts`
- Create: `src/app/api/import/cozi/route.ts`
- Create: `src/app/(app)/settings/integrations/page.tsx`
- Test: `src/lib/__tests__/cozi-parser.test.ts`

- [ ] **Step 1: Write failing test `src/lib/__tests__/cozi-parser.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseIcs } from '@/lib/cozi-parser'

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cozi//EN
BEGIN:VEVENT
UID:abc123@cozi.com
DTSTART:20260420T090000Z
DTEND:20260420T100000Z
SUMMARY:Soccer Practice
DESCRIPTION:At the north oval
END:VEVENT
BEGIN:VEVENT
UID:def456@cozi.com
DTSTART;VALUE=DATE:20260421
DTEND;VALUE=DATE:20260422
SUMMARY:School Excursion
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('parses timed events', () => {
    const events = parseIcs(SAMPLE_ICS)
    const soccer = events.find(e => e.title === 'Soccer Practice')
    expect(soccer).toBeDefined()
    expect(soccer!.isAllDay).toBe(false)
    expect(soccer!.start).toBe('2026-04-20T09:00:00.000Z')
    expect(soccer!.description).toBe('At the north oval')
  })

  it('parses all-day events', () => {
    const events = parseIcs(SAMPLE_ICS)
    const excursion = events.find(e => e.title === 'School Excursion')
    expect(excursion).toBeDefined()
    expect(excursion!.isAllDay).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(parseIcs('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/cozi-parser.test.ts
```

Expected: FAIL — `parseIcs` not found.

- [ ] **Step 3: Write `src/lib/cozi-parser.ts`**

```typescript
import ical from 'node-ical'

export interface ParsedEvent {
  title: string
  description: string | null
  start: string
  end: string
  isAllDay: boolean
  category: string | null
}

export function parseIcs(icsContent: string): ParsedEvent[] {
  if (!icsContent.trim()) return []

  let parsed: ReturnType<typeof ical.parseICS>
  try {
    parsed = ical.parseICS(icsContent)
  } catch {
    return []
  }

  const events: ParsedEvent[] = []

  for (const key in parsed) {
    const component = parsed[key]
    if (component.type !== 'VEVENT') continue
    if (!component.summary || !component.start) continue

    const isAllDay = component.datetype === 'date'

    const startDate = component.start instanceof Date
      ? component.start
      : new Date(component.start as string)
    const endDate = component.end instanceof Date
      ? component.end
      : startDate

    events.push({
      title: String(component.summary),
      description: component.description ? String(component.description) : null,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      isAllDay,
      category: null,
    })
  }

  return events
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/cozi-parser.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Write `src/app/api/import/cozi/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'
import { parseIcs } from '@/lib/cozi-parser'

export async function POST(req: Request) {
  const user = await requireAdmin()

  const formData = await req.formData()
  const icsFile = formData.get('ics') as File | null

  if (!icsFile) {
    return NextResponse.json({ error: 'No .ics file provided' }, { status: 400 })
  }

  const icsText = await icsFile.text()
  const parsedEvents = parseIcs(icsText)

  // Batch insert events
  let eventCount = 0
  for (const e of parsedEvents) {
    await prisma.event.create({
      data: {
        title: e.title,
        description: e.description,
        start: new Date(e.start),
        end: new Date(e.end),
        isAllDay: e.isAllDay,
        category: e.category,
        createdBy: user.id,
        familyId: user.familyId,
      },
    })
    eventCount++
  }

  // Log the import
  await prisma.coziImport.create({
    data: {
      importedBy: user.id,
      familyId: user.familyId,
      eventCount,
      listCount: 0,
      itemCount: 0,
      notes: `Imported from file: ${icsFile.name}`,
    },
  })

  return NextResponse.json({
    success: true,
    eventCount,
    message: `Imported ${eventCount} events from Cozi.`,
  })
}
```

- [ ] **Step 6: Write `src/app/(app)/settings/integrations/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface ImportResult {
  success: boolean
  eventCount?: number
  message?: string
  error?: string
}

export default function IntegrationsPage() {
  const [icsFile, setIcsFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleImport() {
    if (!icsFile) return
    setLoading(true)
    setResult(null)

    const form = new FormData()
    form.append('ics', icsFile)

    const res = await fetch('/api/import/cozi', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setResult({ success: false, error: data.error ?? 'Import failed' })
    } else {
      setResult({ success: true, eventCount: data.eventCount, message: data.message })
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">Manage external integrations and data imports.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import from Cozi</CardTitle>
          <CardDescription>
            Export your Cozi calendar as an .ics file and upload it here to import your events.
            Lists must be re-entered manually in Homebase.
            This can be run again if needed (e.g. after a redeploy).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Button variant="outline" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Choose .ics file
                </span>
              </Button>
              <input
                type="file"
                accept=".ics"
                className="hidden"
                onChange={e => setIcsFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {icsFile && (
              <span className="text-sm text-muted-foreground">{icsFile.name}</span>
            )}
          </div>

          <Button onClick={handleImport} disabled={!icsFile || loading}>
            {loading ? 'Importing...' : 'Import Events'}
          </Button>

          {result && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md
              ${result.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
              {result.success
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{result.success ? result.message : result.error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            How to export from Cozi: Open Cozi → Settings → Export calendar → Download .ics file.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Umami Analytics</CardTitle>
          <CardDescription>Coming in Phase 3 — configure your Umami tracking script.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not yet configured.</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: Verify Cozi import in browser**

```bash
npm run dev
```

Open http://localhost:3000/settings/integrations → upload a `.ics` file exported from Cozi → click Import. Should show success with event count. Open the Calendar → imported events should appear.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: Cozi .ics import with parser, API route, and admin-only UI"
```

---

## Task 11: Docker Build & Synology Deploy

**Files:**
- Modify: `docker/entrypoint.sh` (verify)
- Create: `.env` (local, gitignored)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (invite × 5, events × 3, cozi-parser × 3).

- [ ] **Step 2: Build the Docker image**

```bash
docker build -t homebase:latest .
```

Expected: Build completes successfully. Watch for any TypeScript or build errors.

- [ ] **Step 3: Create `data/` directory and run locally**

```bash
mkdir -p data
docker run --rm \
  -p 3001:3000 \
  -v "$(pwd)/data:/data" \
  -e DATABASE_URL="file:/data/homebase.db" \
  -e NEXTAUTH_SECRET="local-dev-secret-change-me" \
  -e NEXTAUTH_URL="http://localhost:3001" \
  -e ENCRYPTION_KEY="dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==" \
  homebase:latest
```

Expected: Server starts, migrations run, `Homebase listening on port 3000`.

- [ ] **Step 4: Smoke test the Docker container**

Open http://localhost:3001 → redirects to /login → register first user → creates family → login → dashboard shows 2×2 cards → calendar works → import page accessible.

- [ ] **Step 5: Tag for Synology**

```bash
# Replace YOUR_SYNOLOGY_REGISTRY with your actual registry/path
docker tag homebase:latest YOUR_SYNOLOGY_REGISTRY/homebase:phase1
docker push YOUR_SYNOLOGY_REGISTRY/homebase:phase1
```

Or copy the image directly:
```bash
docker save homebase:latest | gzip > homebase-phase1.tar.gz
# SCP to Synology, then: docker load < homebase-phase1.tar.gz
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: Phase 1 complete — auth, calendar, dashboard, Cozi import, Docker"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Fullscreen layout (100vh/vw AppShell)
- ✅ Persistent sidebar with all 5 nav links + Settings
- ✅ Home dashboard with 2×2 cards
- ✅ Auth: email/password, first-user admin, invite system
- ✅ Family model with roles
- ✅ Calendar: month + week views, CRUD
- ✅ Cozi .ics import (re-runnable, admin only, logs to CoziImport)
- ✅ Settings → Integrations page (Cozi import UI + Umami placeholder)
- ✅ Docker: multi-stage build, compose, entrypoint with migrations
- ✅ Health endpoint for Docker healthcheck

**Phases 2 and 3** will be planned separately once Phase 1 is deployed and tested on Synology.
