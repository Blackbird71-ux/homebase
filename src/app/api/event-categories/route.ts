import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

const DEFAULT_EVENT_CATEGORIES = [
  { name: 'Medical', color: '#ef4444' },
  { name: 'School', color: '#3b82f6' },
  { name: 'Social', color: '#8b5cf6' },
  { name: 'Work', color: '#f59e0b' },
  { name: 'Other', color: '#6b7280' },
]

export async function GET() {
  const user = await requireSession()

  // Check if family has any event categories
  const existingCategories = await prisma.eventCategory.findMany({
    where: { familyId: user.familyId },
    orderBy: { sortOrder: 'asc' },
  })

  // If no categories exist, create default ones
  if (existingCategories.length === 0) {
    const createdCategories = []
    for (let i = 0; i < DEFAULT_EVENT_CATEGORIES.length; i++) {
      const cat = DEFAULT_EVENT_CATEGORIES[i]
      const created = await prisma.eventCategory.create({
        data: {
          name: cat.name,
          color: cat.color,
          isSystem: true,
          sortOrder: i * 10,
          familyId: user.familyId,
        },
      })
      createdCategories.push(created)
    }
    return NextResponse.json(createdCategories)
  }

  return NextResponse.json(existingCategories)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { name, color } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const trimmedName = name.trim()

  // Check if name already exists for this family
  const existing = await prisma.eventCategory.findFirst({
    where: { familyId: user.familyId, name: trimmedName },
  })
  if (existing) {
    return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
  }

  // Get the highest sort order to append at the end
  const lastCategory = await prisma.eventCategory.findFirst({
    where: { familyId: user.familyId },
    orderBy: { sortOrder: 'desc' },
  })
  const nextSortOrder = (lastCategory?.sortOrder ?? 0) + 10

  const category = await prisma.eventCategory.create({
    data: {
      name: trimmedName,
      color: color ?? null,
      isSystem: false,
      sortOrder: nextSortOrder,
      familyId: user.familyId,
    },
  })

  return NextResponse.json(category, { status: 201 })
}
