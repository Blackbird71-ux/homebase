import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { isValidBirthdayDate } from '@/lib/date-engine'
import { convertBirthdayToContact } from '@/lib/birthday-contact'

// Creates a contact from a calendar birthday — a Family.birthdays entry, or
// a real Event when eventId is given — and removes that source, so the
// birthday's single source of truth becomes the contact.
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, date, eventId } = body
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!date || typeof date !== 'string' || !isValidBirthdayDate(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD or MM-DD' }, { status: 400 })
  }
  if (eventId !== undefined && typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId must be a string' }, { status: 400 })
  }

  const { contact, reusedExisting } = await convertBirthdayToContact(user.familyId, name, date, eventId)

  void createAuditLog(
    user,
    reusedExisting ? 'update' : 'create',
    'contact',
    contact.id,
    `Created contact "${name}" from calendar birthday`,
    { contact: { name, birthday: date } }
  )

  return NextResponse.json(contact, { status: reusedExisting ? 200 : 201 })
}
