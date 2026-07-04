import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { execSync } from 'child_process'

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups'
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT || '/app/scripts/backup-db.sh'

async function _POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

export const POST = withRouteErrors(_POST)
