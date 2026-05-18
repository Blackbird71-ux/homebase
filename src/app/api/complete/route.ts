import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCompleteToken } from '@/lib/complete-token'

function htmlPage(title: string, heading: string, body: string, success: boolean): Response {
  const color = success ? '#16a34a' : '#dc2626'
  const bg = success ? '#f0fdf4' : '#fef2f2'
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr><td style="background:#1e293b;padding:20px 32px">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700">HomeBase</p>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center">
          <div style="width:56px;height:56px;border-radius:50%;background:${bg};border:2px solid ${color};margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:56px">${success ? '✓' : '✕'}</div>
          <h2 style="margin:0 0 12px;color:#1e293b;font-size:22px">${heading}</h2>
          <p style="margin:0;color:#64748b;font-size:15px">${body}</p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">HomeBase family app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  return new Response(html, {
    status: success ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function calculateNextDueDate(
  chore: {
    frequency: string
    dayOfWeek: number | null
    dayOfMonth: number | null
    triggerOnComplete: boolean
    allowEarlyStart: boolean
    endDate: Date | null
    nextDueDate: Date | null
  },
  completedAt: Date
): Date | null {
  const now = new Date()
  // One-off chores have no next occurrence — deactivate after completion
  if (chore.frequency === 'one-off') return null

  let baseDate: Date
  if (chore.triggerOnComplete) {
    baseDate = completedAt
  } else if (chore.allowEarlyStart && chore.nextDueDate && chore.nextDueDate > now) {
    baseDate = chore.nextDueDate
  } else {
    baseDate = now
  }

  let next: Date

  switch (chore.frequency) {
    case 'daily': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'weekly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      if (chore.dayOfWeek !== null) {
        const currentDay = next.getDay()
        let daysUntil = chore.dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setDate(next.getDate() + daysUntil)
      } else {
        next.setDate(next.getDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 14)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'halfyearly':
    case 'yearly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      let monthsToAdd = 1
      if (chore.frequency === 'bimonthly') monthsToAdd = 2
      else if (chore.frequency === 'quarterly') monthsToAdd = 3
      else if (chore.frequency === 'halfyearly') monthsToAdd = 6
      else if (chore.frequency === 'yearly') monthsToAdd = 12
      if (chore.dayOfMonth !== null) {
        next.setMonth(next.getMonth() + monthsToAdd)
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(chore.dayOfMonth, lastDay))
      } else {
        next.setMonth(next.getMonth() + monthsToAdd)
      }
      break
    }
    default: {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 7)
      next.setHours(0, 0, 0, 0)
    }
  }

  if (chore.endDate && next > chore.endDate) return null
  return next
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return htmlPage('Invalid link', 'Invalid link', 'This link is missing required information.', false)
  }

  const payload = verifyCompleteToken(token)
  if (!payload) {
    return htmlPage('Link expired', 'Link expired or invalid', 'This completion link has expired or is invalid. Please log in to HomeBase to mark the item complete.', false)
  }

  if (payload.type === 'chore') {
    const chore = await prisma.chore.findUnique({ where: { id: payload.id } })
    if (!chore || !chore.isActive) {
      return htmlPage('Not found', 'Chore not found', 'This chore no longer exists or has been deactivated.', false)
    }

    // Check the chore hasn't already been completed since this reminder was sent
    const recentCompletion = await prisma.choreCompletion.findFirst({
      where: { choreId: payload.id },
      orderBy: { completedAt: 'desc' },
    })
    const reminderSentAt = new Date(payload.exp - 7 * 24 * 3600 * 1000)
    if (recentCompletion && recentCompletion.completedAt > reminderSentAt) {
      return htmlPage(
        'Already done',
        'Already marked complete',
        `"${chore.title}" was already completed after this reminder was sent.`,
        true
      )
    }

    const completedAt = new Date()
    await prisma.choreCompletion.create({
      data: { choreId: payload.id, completedById: payload.assigneeId },
    })

    const nextDueDate = calculateNextDueDate(chore, completedAt)
    const updateData: Record<string, unknown> = nextDueDate === null
      ? { isActive: false, nextDueDate: null }
      : { nextDueDate }

    if (chore.autoRotateOnComplete) {
      const members = await prisma.user.findMany({
        where: { familyId: chore.familyId },
        select: { id: true },
        orderBy: { name: 'asc' },
      })
      if (members.length > 0) {
        const currentIndex = members.findIndex(m => m.id === chore.currentAssigneeId)
        updateData.currentAssigneeId = members[(currentIndex + 1) % members.length].id
      }
    }

    await prisma.chore.update({ where: { id: payload.id }, data: updateData })

    return htmlPage(
      'Done!',
      'Marked complete!',
      `"${chore.title}" has been marked as complete. ${nextDueDate ? `Next due: ${nextDueDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}.` : 'The chore has been deactivated as it has reached its end date.'}`,
      true
    )
  }

  return htmlPage('Unknown', 'Unknown item type', 'This link type is not supported.', false)
}
