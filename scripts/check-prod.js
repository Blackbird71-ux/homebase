const { PrismaClient } = require('@prisma/client')
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3')

const adapter = new PrismaBetterSqlite3({ url: 'file:/tmp/production.db' })
const p = new PrismaClient({ adapter })

async function main() {
  const events = await p.event.findMany({
    orderBy: { start: 'desc' },
    take: 30,
  })

  console.log('=== Events in PRODUCTION database ===')
  console.log(`Total: ${events.length}`)
  console.log('')
  for (const e of events) {
    console.log(JSON.stringify({
      id: e.id.substring(0, 12) + '...',
      title: e.title,
      start: e.start,
      end: e.end,
      isRecurring: e.isRecurring,
      recurrenceRule: e.recurrenceRule,
      recurrenceEndDate: e.recurrenceEndDate,
    }))
  }

  const recurringCount = events.filter(e => e.isRecurring).length
  console.log(`\n=== Recurring events: ${recurringCount} ===`)

  const total = await p.event.count()
  console.log(`Total events in database: ${total}`)

  await p.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })
