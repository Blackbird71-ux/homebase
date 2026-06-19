import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { clearUserLocation } from '@/lib/location'
import type { SessionUser } from '@/types'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      lineHeight: true,
      fontWeight: true,
      weekStartsOn: true,
      doneItemColor: true,
      shareLocation: true,
      uiPreferences: true,
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

  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Parse uiPreferences JSON if it exists
  const parsedUser = {
    ...dbUser,
    uiPreferences: dbUser.uiPreferences ? JSON.parse(dbUser.uiPreferences) : null,
  }
  
  return NextResponse.json(parsedUser)
}

export async function PATCH(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const { theme, fontSize, lineHeight, fontWeight, weekStartsOn, doneItemColor, name, currentPassword, newPassword, uiPreferences, shareLocation } = body

  if (theme !== undefined && !['light', 'dark', 'system', 'modern', 'aurora', 'midnight', 'apple-grey', 'apple-pro', 'apple-aqua', 'apple-graphite', 'apple-sunset', 'apple-midnight', 'apple-forest', 'glass-dark', 'sunset', 'ocean', 'forest', 'paper', 'harbour', 'plum', 'high-contrast', 'high-contrast-dark', 'high-contrast-sunset', 'high-contrast-ocean', 'high-contrast-forest', 'high-contrast-midnight'].includes(theme)) {
    return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 })
  }
  if (fontSize !== undefined && !['sm', 'base', 'lg', 'xl'].includes(fontSize)) {
    return NextResponse.json({ error: 'Invalid fontSize value' }, { status: 400 })
  }
  if (lineHeight !== undefined && !['normal', 'relaxed', 'spacious'].includes(lineHeight)) {
    return NextResponse.json({ error: 'Invalid lineHeight value' }, { status: 400 })
  }
  if (fontWeight !== undefined && !['normal', 'medium'].includes(fontWeight)) {
    return NextResponse.json({ error: 'Invalid fontWeight value' }, { status: 400 })
  }
  if (weekStartsOn !== undefined && ![0, 1].includes(weekStartsOn)) {
    return NextResponse.json({ error: 'Invalid weekStartsOn value' }, { status: 400 })
  }
  if (shareLocation !== undefined && typeof shareLocation !== 'boolean') {
    return NextResponse.json({ error: 'Invalid shareLocation value' }, { status: 400 })
  }
  
  // Validate doneItemColor - allow hex codes (#RRGGBB) or named colors
  if (doneItemColor !== undefined) {
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$|^[A-Za-z]+$/
    if (typeof doneItemColor !== 'string' || !colorRegex.test(doneItemColor)) {
      return NextResponse.json(
        { error: 'Invalid color value. Use hex code (#RRGGBB) or named color' },
        { status: 400 }
      )
    }
  }

  // Validate uiPreferences if provided
  if (uiPreferences !== undefined) {
    try {
      // Try to parse if it's a string
      const parsed = typeof uiPreferences === 'string' ? JSON.parse(uiPreferences) : uiPreferences
      
      // Validate custom theme colors if present
      if (parsed.customTheme) {
        const customTheme = parsed.customTheme
        const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$|^[A-Za-z]+$|^oklch\([^)]+\)$|^rgb\([^)]+\)$|^hsl\([^)]+\)$|^$/
        
        for (const [key, value] of Object.entries(customTheme)) {
          if (value && typeof value === 'string' && value.trim() !== '') {
            if (!colorRegex.test(value)) {
              return NextResponse.json(
                { error: `Invalid color value for ${key}. Use hex, rgb, hsl, oklch, or named color` },
                { status: 400 }
              )
            }
          }
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid uiPreferences JSON format' },
        { status: 400 }
      )
    }
  }

  const updateData: Record<string, unknown> = {}
  if (theme !== undefined) updateData.theme = theme
  if (fontSize !== undefined) updateData.fontSize = fontSize
  if (lineHeight !== undefined) updateData.lineHeight = lineHeight
  if (fontWeight !== undefined) updateData.fontWeight = fontWeight
  if (weekStartsOn !== undefined) updateData.weekStartsOn = weekStartsOn
  if (doneItemColor !== undefined) updateData.doneItemColor = doneItemColor
  if (shareLocation !== undefined) updateData.shareLocation = shareLocation
  if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
    updateData.name = name.trim()
  }
  if (uiPreferences !== undefined) {
    // Merge with existing uiPreferences so we don't lose other settings (e.g. customTheme)
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { uiPreferences: true },
    })
    let merged = {}
    if (existingUser?.uiPreferences) {
      try {
        merged = JSON.parse(existingUser.uiPreferences)
      } catch {
        // ignore parse errors
      }
    }
    const incoming = typeof uiPreferences === 'string' ? JSON.parse(uiPreferences) : uiPreferences
    merged = { ...merged, ...incoming }
    updateData.uiPreferences = JSON.stringify(merged)
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
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, dbUser.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    updateData.password = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      theme: true,
      fontSize: true,
      lineHeight: true,
      fontWeight: true,
      weekStartsOn: true,
      doneItemColor: true,
      shareLocation: true,
      uiPreferences: true,
    },
  })

  // Turning sharing off removes the last-known location so it can't be read by others
  if (shareLocation === false) {
    await clearUserLocation(user.id)
  }

  // Parse uiPreferences in response
  const parsedUpdated = {
    ...updated,
    uiPreferences: updated.uiPreferences ? JSON.parse(updated.uiPreferences) : null,
  }

  return NextResponse.json(parsedUpdated)
}

export async function DELETE() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Safety check: don't allow the last admin to delete themselves
  const adminCount = await prisma.user.count({
    where: { familyId: user.familyId, role: 'admin' },
  })

  if (adminCount === 1 && user.role === 'admin') {
    return NextResponse.json(
      {
        error:
          'You are the only admin. Promote another family member to admin before deleting your account.',
      },
      { status: 400 }
    )
  }

  await prisma.user.delete({ where: { id: user.id } })
  return NextResponse.json({ success: true })
}
