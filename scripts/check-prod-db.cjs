const Database = require('better-sqlite3')

const db = new Database('c:\\Appdev\\HomeBase\\data\\production.db')

console.log('=== Events in PRODUCTION database ===')
const events = db.prepare('SELECT id, title, start, end, isRecurring, recurrenceRule, recurrenceEndDate FROM Event ORDER BY start DESC LIMIT 30').all()
console.log(`Total events returned: ${events.length}`)
console.log('')
for (const e of events) {
  console.log({
    id: e.id.substring(0, 12) + '...',
    title: e.title,
    start: e.start,
    end: e.end,
    isRecurring: !!e.isRecurring,
    recurrenceRule: e.recurrenceRule,
    recurrenceEndDate: e.recurrenceEndDate,
  })
}

const recurringCount = events.filter(e => e.isRecurring).length
console.log(`\n=== Recurring events: ${recurringCount} ===`)

// Also check total count
const total = db.prepare('SELECT COUNT(*) as count FROM Event').get()
console.log(`Total events in database: ${total.count}`)

db.close()
