import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { parseIcs } from '@/lib/cozi-parser'

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const formData = await req.formData()
  const icsFile = formData.get('ics') as File | null

  if (!icsFile) {
    return NextResponse.json({ error: 'No .ics file provided' }, { status: 400 })
  }

  const icsText = await icsFile.text()
  const parsedEvents = parseIcs(icsText)

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

export const POST = withRouteErrors(_POST)
