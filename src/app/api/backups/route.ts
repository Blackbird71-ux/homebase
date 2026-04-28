import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups'

export async function GET() {
  await requireSession()

  if (!existsSync(BACKUP_DIR)) {
    return NextResponse.json({ backups: [] })
  }

  try {
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db.gz'))
      .map((f) => {
        const fullPath = join(BACKUP_DIR, f)
        const stats = statSync(fullPath)
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ backups: files })
  } catch {
    return NextResponse.json({ backups: [] })
  }
}
