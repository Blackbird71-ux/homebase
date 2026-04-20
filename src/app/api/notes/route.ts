import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')

  const notes = await prisma.note.findMany({
    where: {
      familyId: user.familyId,
      ...(search && {
        OR: [
          { title: { contains: search } },
          { content: { contains: search } },
        ],
      }),
      ...(category && { category }),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Filter by tag if specified (tags are stored as JSON array)
  let filteredNotes = notes
  if (tag) {
    filteredNotes = notes.filter(note => {
      if (!note.tags) return false
      try {
        const tagsArray = JSON.parse(note.tags) as string[]
        return tagsArray.includes(tag)
      } catch {
        return false
      }
    })
  }

  return NextResponse.json(
    filteredNotes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      tags: note.tags ? JSON.parse(note.tags) as string[] : [],
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, content, category, tags } = body

  if (!title || !content) {
    return NextResponse.json(
      { error: 'title and content are required' },
      { status: 400 }
    )
  }

  const note = await prisma.note.create({
    data: {
      title,
      content,
      category: category || null,
      tags: tags ? JSON.stringify(tags) : null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }, { status: 201 })
}