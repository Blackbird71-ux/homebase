import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getAccessToken, deleteGoogleEvent } from '@/lib/google-calendar'

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json() as { deleteFromGoogle?: boolean }

  if (typeof body.deleteFromGoogle !== 'boolean') {
    return NextResponse.json({ error: 'deleteFromGoogle must be a boolean' }, { status: 400 })
  }

  if (body.deleteFromGoogle) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    })

    if (dbUser?.googleRefreshToken) {
      const syncRows = await prisma.googleCalendarSync.findMany({
        where: { userId: user.id },
      })

      let token: string | null = null
      try {
        token = await getAccessToken(dbUser.googleRefreshToken)
      } catch {
        // If we can't get a token, skip deletion from Google
      }

      if (token) {
        for (const row of syncRows) {
          try {
            await deleteGoogleEvent(token, row.googleEventId)
          } catch {
            console.error(`[disconnect] Failed to delete Google event ${row.googleEventId}`)
          }
        }
      }

      await prisma.googleCalendarSync.deleteMany({ where: { userId: user.id } })
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { googleConnected: false, googleRefreshToken: null, googleEmail: null },
  })

  return NextResponse.json({ success: true })
}

export const POST = withRouteErrors(_POST)
