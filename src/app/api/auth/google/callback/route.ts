import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('google_oauth_state')?.value

  if (!state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    error?: string
  }

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 400 })
  }

  // Fetch Google email from userinfo
  let googleEmail: string | null = null
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const info = await infoRes.json() as { email?: string }
    googleEmail = info.email ?? null
  } catch {
    // email is optional
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleConnected: true,
      googleRefreshToken: tokenData.refresh_token,
      googleEmail,
    },
  })

  const response = NextResponse.redirect(
    new URL('/settings?google=connected', req.url)
  )
  response.cookies.delete('google_oauth_state')
  return response
}
