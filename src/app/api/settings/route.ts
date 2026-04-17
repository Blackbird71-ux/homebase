import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const session = await requireSession()

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
      family: {
        select: {
          id: true,
          name: true,
          umamiScriptUrl: true,
          umamiSiteId: true,
        },
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: Request) {
  const session = await requireSession()
  const body = await req.json()

  const { theme, fontSize, weekStartsOn, name, currentPassword, newPassword } = body

  if (theme !== undefined && !['light', 'dark', 'system', 'modern', 'midnight', 'apple-grey', 'glass-dark'].includes(theme)) {
    return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 })
  }
  if (fontSize !== undefined && !['sm', 'base', 'lg'].includes(fontSize)) {
    return NextResponse.json({ error: 'Invalid fontSize value' }, { status: 400 })
  }
  if (weekStartsOn !== undefined && ![0, 1].includes(weekStartsOn)) {
    return NextResponse.json({ error: 'Invalid weekStartsOn value' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (theme !== undefined) updateData.theme = theme
  if (fontSize !== undefined) updateData.fontSize = fontSize
  if (weekStartsOn !== undefined) updateData.weekStartsOn = weekStartsOn
  if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
    updateData.name = name.trim()
  }

  if (currentPassword !== undefined || newPassword !== undefined) {
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Both currentPassword and newPassword are required' },
        { status: 400 }
      )
    }
    if (typeof newPassword === 'string' && newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }
    const user = await prisma.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    updateData.password = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: session.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      weekStartsOn: true,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE() {
  const session = await requireSession()

  // Safety check: don't allow the last admin to delete themselves
  const adminCount = await prisma.user.count({
    where: { familyId: session.familyId, role: 'admin' },
  })

  if (adminCount === 1 && session.role === 'admin') {
    return NextResponse.json(
      {
        error:
          'You are the only admin. Promote another family member to admin before deleting your account.',
      },
      { status: 400 }
    )
  }

  await prisma.user.delete({ where: { id: session.id } })
  return NextResponse.json({ success: true })
}
