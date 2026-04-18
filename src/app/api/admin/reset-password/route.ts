import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const token = req.headers.get('x-reset-token')
  if (!token || token !== process.env.ADMIN_RESET_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password } = await req.json()
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'email and password (min 8 chars) required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { email }, data: { password: hashed } })

  return NextResponse.json({ ok: true, message: `Password reset for ${email}` })
}
