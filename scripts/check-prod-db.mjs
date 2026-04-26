import { PrismaClient } from '@prisma/client'

// Point to the production database copy
process.env.DATABASE_URL = 'file:../data/production.db'

const prisma = new PrismaClient()

async function main() {
  const events = await prisma.event.findMany({
    orderBy: { start: 'desc' },
    take: 30,
  })

  console.log('=== Events in PRODUCTION database ===')
  console.log(`Total events: ${events.length}`)
  console.log('')
  for (const e of events) {
    console.log({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      isRecurring: e.isRecurring,
      recurrenceRule: e.recurrenceRule,
      recurrenceEndDate: e.recurrenceEndDate?.toISOString() ?? null,
      createdBy: e.createdBy,
    })
  }

  // Count recurring events
  const recurringCount = events.filter(e => e.isRecurring).length
  console.log(`\n=== Recurring events: ${recurringCount} ===`)

  await prisma.$disconnect()
}

main().catch(console.error)
