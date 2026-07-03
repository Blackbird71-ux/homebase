#!/usr/bin/env node
/**
 * normalize-user-emails.cjs — one-off data repair.
 *
 * WHY: the register route stored User.email exactly as typed, while the
 * password-reset lookup lowercases — a user who registered mixed-case could
 * never receive a reset email (the enumeration-safe response masked it). The
 * code fix (normalise at register, login, and every user-by-email lookup)
 * lives in src/app/api/register/route.ts, src/lib/auth.ts and siblings; this
 * script lowercases+trims rows that were already stored mixed-case.
 *
 * Collision-checked: if two rows share the same lowercased form, neither is
 * touched (the unique index would reject the write) — they are reported for
 * manual merge instead.
 *
 * Usage:
 *   node scripts/normalize-user-emails.cjs           # dry-run (no writes)
 *   node scripts/normalize-user-emails.cjs --apply   # write changes
 */

const path = require('path')
const Database = require('better-sqlite3')

const apply = process.argv.includes('--apply')
const dbPath = path.join(__dirname, '..', 'data', 'homebase.db')
const db = new Database(dbPath, { readonly: !apply })

const users = db.prepare(`SELECT id, email, name FROM User`).all()

const byLower = new Map()
for (const u of users) {
  const key = u.email.toLowerCase().trim()
  if (!byLower.has(key)) byLower.set(key, [])
  byLower.get(key).push(u)
}

const changes = []
const collisions = []
for (const u of users) {
  const normalized = u.email.toLowerCase().trim()
  if (normalized === u.email) continue
  if (byLower.get(normalized).length > 1) {
    collisions.push(u)
  } else {
    changes.push({ id: u.id, name: u.name, from: u.email, to: normalized })
  }
}

console.log(`\nUsers needing normalisation: ${changes.length}; collisions (left untouched): ${collisions.length}\n`)
for (const c of changes) console.log(`  ${c.name}: ${c.from} -> ${c.to}`)
for (const c of collisions) {
  console.log(`  COLLISION: ${c.name} (${c.id}) "${c.email}" — lowercased form already in use; merge manually`)
}

if (!apply) {
  console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.')
} else {
  const stmt = db.prepare(`UPDATE User SET email = ? WHERE id = ?`)
  const tx = db.transaction((items) => {
    for (const it of items) stmt.run(it.to, it.id)
  })
  tx(changes)
  console.log(`\nAPPLIED — ${changes.length} rows updated.`)
}
db.close()
