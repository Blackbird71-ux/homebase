// src/lib/birthday-contact.ts
// Server-only: converts a calendar birthday into a HouseholdContact. The
// source — a Family.birthdays JSON entry, or a real Event (when eventId is
// given) — is removed in the same transaction so each birthday has exactly
// one source of truth (no duplicate calendar events).

import { prisma } from '@/lib/prisma'
import type { BirthdayEntry } from '@/lib/date-engine'

export async function convertBirthdayToContact(
  familyId: string,
  name: string,
  date: string,
  eventId?: string
) {
  return prisma.$transaction(async (tx) => {
    // Reuse an existing contact with the same name rather than duplicating it
    const existing = await tx.householdContact.findFirst({
      where: { familyId, name },
    })
    const contact = existing
      ? await tx.householdContact.update({
          where: { id: existing.id },
          data: { birthday: existing.birthday ?? date },
        })
      : await tx.householdContact.create({
          data: { name, category: 'family', birthday: date, familyId },
        })

    if (eventId) {
      // The birthday came from a real calendar event — delete it (whole
      // series, if recurring) so the contact's synthetic event replaces it
      await tx.event.deleteMany({ where: { id: eventId, familyId } })
      return { contact, reusedExisting: !!existing }
    }

    // Remove the matching entry from Family.birthdays
    const family = await tx.family.findUnique({
      where: { id: familyId },
      select: { birthdays: true },
    })
    if (family?.birthdays) {
      try {
        const entries: BirthdayEntry[] = JSON.parse(family.birthdays)
        if (Array.isArray(entries)) {
          const remaining = entries.filter(
            (e) => !(e?.name === name && e?.date === date && (e?.type ?? 'birthday') === 'birthday')
          )
          if (remaining.length !== entries.length) {
            await tx.family.update({
              where: { id: familyId },
              data: { birthdays: remaining.length > 0 ? JSON.stringify(remaining) : null },
            })
          }
        }
      } catch {
        // Malformed JSON — leave it untouched; the contact is still created
      }
    }

    return { contact, reusedExisting: !!existing }
  })
}
