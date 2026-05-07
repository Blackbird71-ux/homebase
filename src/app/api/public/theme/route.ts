import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const user = await prisma.user.findFirst({ select: { theme: true } })
    return NextResponse.json({ theme: user?.theme ?? 'dark' })
  } catch {
    return NextResponse.json({ theme: 'dark' })
  }
}
