/**
 * Seed script: Create birthday and anniversary events for family members.
 *
 * This script reads the `birthdays` field from the Family model (JSON string)
 * and creates yearly recurring events for each entry.
 *
 * Usage: npx tsx scripts/seed-birthdays.ts
 *
 * The birthdays field on Family is a JSON string with format:
 * [
 *   { "name": "Mum", "type": "birthday", "date": "1975-06-15" },
 *   { "name": "Dad", "type": "birthday", "date": "1973-11-22" },
 *   { "name": "Wedding", "type": "anniversary", "date": "2000-09-10" }
 * ]
 *
 * To set birthdays for your family, use the Settings > Family page
 * or run: npx prisma db execute --stdin <<< "UPDATE Family SET birthdays = '...' WHERE id = '...';"
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BIRTHDAY_COLOR = '#ec4899' // Pink for birthdays
const ANNIVERSARY_COLOR = '#f59e0b' // Amber for anniversaries

interface BirthdayEntry {
  name: string
  type: 'birthday' | 'anniversary'
  date: string | null
}

async function main() {
  console.log('=== Birthday & Anniversary Seed Script ===\n')

  // Find all families
  const families = await prisma.family.findMany({
    select: { id: true, name: true, birthdays: true },
  })

  if (families.length === 0) {
    console.log('No families found. Nothing to seed.')
    return
  }

  for (const family of families) {
    console.log(`\n--- Family: ${family.name} (${family.id}) ---`)

    // Get existing birthday/anniversary events for this family
    const existingEvents = await prisma.event.findMany({
      where: {
        familyId: family.id,
        OR: [
          { category: 'Birthday' },
          { category: 'Anniversary' },
        ],
      },
      select: { title: true, category: true },
    })

    const existingTitles = new Set(existingEvents.map(e => `${e.category}:${e.title}`))

    // Parse birthdays from the family record
    let entries: BirthdayEntry[] = []

    if (family.birthdays) {
      try {
        const parsed = JSON.parse(family.birthdays)
        if (Array.isArray(parsed)) {
          entries = parsed
        }
      } catch {
        console.log('  Could not parse birthdays field')
      }
    }

    if (entries.length === 0) {
      console.log('  No birthday/anniversary data configured for this family.')
      console.log('  To add birthdays, set the birthdays JSON field on the Family model.')
      console.log('  Example format: [{"name":"Mum","type":"birthday","date":"1975-06-15"}]')
      continue
    }

    for (const entry of entries) {
      if (!entry.date) {
        console.log(`  Skipping ${entry.name} (no date)`)
        continue
      }

      const category = entry.type === 'birthday' ? 'Birthday' : 'Anniversary'
      const color = entry.type === 'birthday' ? BIRTHDAY_COLOR : ANNIVERSARY_COLOR
      const title = entry.type === 'birthday'
        ? `🎂 ${entry.name}'s Birthday`
        : `💍 ${entry.name}`

      // Check if event already exists
      if (existingTitles.has(`${category}:${title}`)) {
        console.log(`  ✓ Already exists: ${title}`)
        continue
      }

      // Parse the date and create a yearly recurring event
      const dateParts = entry.date.split('-')
      if (dateParts.length !== 3) {
        console.log(`  ✗ Invalid date format for ${entry.name}: ${entry.date}`)
        continue
      }

      const month = parseInt(dateParts[1], 10) - 1 // 0-indexed
      const day = parseInt(dateParts[2], 10)

      // Create the event starting from this year
      const currentYear = new Date().getFullYear()
      const startDate = new Date(currentYear, month, day, 0, 0, 0)
      const endDate = new Date(currentYear, month, day, 23, 59, 0)

      // Find an admin user to set as creator
      const adminUser = await prisma.user.findFirst({
        where: { familyId: family.id, role: 'admin' },
        select: { id: true },
      })

      if (!adminUser) {
        console.log(`  ✗ No admin user found for family ${family.name}`)
        continue
      }

      try {
        await prisma.event.create({
          data: {
            title,
            description: `${entry.type === 'birthday' ? 'Birthday' : 'Anniversary'} of ${entry.name}`,
            start: startDate,
            end: endDate,
            isAllDay: true,
            category,
            color,
            createdBy: adminUser.id,
            familyId: family.id,
            isRecurring: true,
            recurrenceRule: 'FREQ=YEARLY',
          },
        })
        console.log(`  ✓ Created: ${title} (${entry.date})`)
      } catch (err) {
        console.error(`  ✗ Failed to create ${title}:`, err)
      }
    }
  }

  console.log('\n=== Done ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
