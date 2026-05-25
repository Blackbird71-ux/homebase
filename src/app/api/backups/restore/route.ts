import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups'
const RESTORE_SCRIPT = process.env.RESTORE_SCRIPT || '/app/scripts/restore-db.sh'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins can restore
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can restore backups' }, { status: 403 })
  }

  const body = await req.json()
  const { filename } = body

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  }

  const backupPath = join(/*turbopackIgnore: true*/ BACKUP_DIR, filename)

  if (!existsSync(backupPath)) {
    return NextResponse.json({ error: 'Backup file not found' }, { status: 404 })
  }

  try {
    execSync(`sh ${RESTORE_SCRIPT} "${backupPath}"`, {
      timeout: 30000,
      stdio: 'pipe',
    })
    return NextResponse.json({ success: true, message: 'Database restored. The app will restart.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Restore failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
