import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCompleteToken } from '@/lib/complete-token'
import { completeChore } from '@/lib/chore-completion'

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

async function _GET(req: Request): Promise<Response> {
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

    // There is no session on the email link; source the timezone from the
    // chore's family so the shared helper computes local-midnight boundaries correctly.
    const family = await prisma.family.findUnique({
      where: { id: chore.familyId },
      select: { timezone: true },
    })
    const timezone = family?.timezone ?? 'UTC'

    // Run the shared completion lifecycle (gate → record → advance → rotate),
    // identical to the in-app and AI paths.
    const result = await completeChore(chore, {
      completedById: payload.assigneeId,
      timezone,
    })

    if (!result.ok) {
      return htmlPage(
        'Not due yet',
        'Not due yet',
        `"${chore.title}" isn't due yet. Log in to HomeBase to complete it ahead of schedule (enable "Allow early completion" on the chore).`,
        false
      )
    }

    const nextDueDate = result.chore.nextDueDate

    return htmlPage(
      'Done!',
      'Marked complete!',
      `"${chore.title}" has been marked as complete. ${nextDueDate ? `Next due: ${nextDueDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone })}.` : 'The chore has been deactivated as it has reached its end date.'}`,
      true
    )
  }

  if (payload.type === 'bill') {
    const bill = await prisma.financeRecurringBill.findFirst({ where: { id: payload.id } })
    if (!bill) {
      return htmlPage('Not found', 'Bill not found', 'This bill no longer exists.', false)
    }

    // The email link must NOT flip payment state: setting paid=true here bypassed
    // the payment lifecycle (no payment transaction, no GL clearing of AP), leaving
    // the subledger out of step with the GL. Instead, send the user into the app
    // where the bill is paid through the full recordBillPayment flow.
    const appUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin
    return NextResponse.redirect(new URL('/finance/bills', appUrl))
  }

  return htmlPage('Unknown', 'Unknown item type', 'This link type is not supported.', false)
}

export const GET = withRouteErrors(_GET)
