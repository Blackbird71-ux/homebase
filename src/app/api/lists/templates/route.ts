import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// GET /api/lists/templates — list all templates for the family
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.listTemplate.findMany({
    where: { familyId: user.familyId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json(templates)
}

// POST /api/lists/templates — create a new template
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, type, items } = body

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (type !== 'SHOPPING' && type !== 'TODO') {
    return NextResponse.json({ error: 'type must be SHOPPING or TODO' }, { status: 400 })
  }

  // Check for duplicate name
  const existing = await prisma.listTemplate.findUnique({
    where: { familyId_name: { familyId: user.familyId, name } },
  })
  if (existing) {
    return NextResponse.json({ error: 'A template with this name already exists' }, { status: 409 })
  }

  const template = await prisma.listTemplate.create({
    data: {
      name,
      type,
      familyId: user.familyId,
      items: items?.length
        ? {
            create: items.map((item: { content: string; category?: string }, idx: number) => ({
              content: item.content,
              category: item.category ?? null,
              sortOrder: idx,
            })),
          }
        : undefined,
    },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(template, { status: 201 })
}

// POST /api/lists/templates?action=clone — clone a template into a new list
export async function PATCH(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'clone') {
    const body = await req.json()
    const { templateId, listName } = body

    if (!templateId || !listName) {
      return NextResponse.json({ error: 'templateId and listName are required' }, { status: 400 })
    }

    const template = await prisma.listTemplate.findFirst({
      where: { id: templateId, familyId: user.familyId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Create a new list from the template
    const list = await prisma.list.create({
      data: {
        name: listName,
        type: template.type,
        familyId: user.familyId,
        items: {
          create: template.items.map((item) => ({
            content: item.content,
            category: item.category,
            sortOrder: item.sortOrder,
            isCompleted: false,
            isLocked: false,
            createdBy: user.id,
          })),
        },
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
    })

    return NextResponse.json(list, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
