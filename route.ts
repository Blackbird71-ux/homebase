import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { execSync } from 'child_process'

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups'
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT || '/app/scripts/backup-db.sh'

export async function POST() {
  const user = await requireSession()

  // Only admins can trigger manual backups
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can create backups' }, { status: 403 })
  }

  try {
    execSync(`sh ${BACKUP_SCRIPT} "${BACKUP_DIR}"`, {
      timeout: 30000,
      stdio: 'pipe',
    })
    return NextResponse.json({ success: true, message: 'Backup created successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
