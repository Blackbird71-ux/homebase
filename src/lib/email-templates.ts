// HTML email templates for reminders and recipe sharing

import { formatCurrency } from '@/lib/financeShared'

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr>
          <td style="background:#1e293b;padding:20px 32px">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:700">HomeBase</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;color:#94a3b8;font-size:12px">This is an automated reminder from your HomeBase family app.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function choreReminderHtml(chore: {
  title: string
  description: string | null
  frequency: string
  nextDueDate: Date
  emailReminderDays: number
}, assigneeName: string, completeUrl?: string): string {
  const dueStr = chore.nextDueDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const daysText = chore.emailReminderDays === 1 ? 'tomorrow' : `in ${chore.emailReminderDays} days`

  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Chore Reminder</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">Hi ${assigneeName}, you have a chore coming up ${daysText}.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1e293b">${chore.title}</p>
      ${chore.description ? `<p style="margin:8px 0 0;color:#475569;font-size:14px">${chore.description}</p>` : ''}
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">
        Due: <strong style="color:#1e293b">${dueStr}</strong> &nbsp;·&nbsp; Frequency: ${chore.frequency}
      </p>
    </div>

    ${completeUrl
      ? `<div style="text-align:center;margin:0 0 24px">
          <a href="${completeUrl}" style="display:inline-block;padding:14px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600">✓ Mark Complete</a>
         </div>`
      : ''}

    <p style="margin:0;color:#94a3b8;font-size:13px">${completeUrl ? 'Or log' : 'Log'} in to HomeBase for full details.</p>
  `
  return baseLayout('Chore Reminder', body)
}

export function eventReminderHtml(event: {
  title: string
  description: string | null
  start: Date
  end: Date
  isAllDay: boolean
  category: string | null
}, familyName: string): string {
  const dateStr = event.start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = event.isAllDay
    ? 'All day'
    : `${event.start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} – ${event.end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`

  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Event Reminder</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">Reminder for the ${familyName} family.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1e293b">${event.title}</p>
      ${event.category ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">${event.category}</p>` : ''}
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">
        <strong style="color:#1e293b">${dateStr}</strong><br>${timeStr}
      </p>
      ${event.description ? `<p style="margin:12px 0 0;color:#475569;font-size:14px">${event.description}</p>` : ''}
    </div>

    <p style="margin:0;color:#64748b;font-size:14px">Check HomeBase for full details.</p>
  `
  return baseLayout('Event Reminder', body)
}

export function documentExpiryHtml(doc: {
  title: string
  category: string
  expiryDate: Date
  remindBefore: number
}, familyName: string): string {
  const expiryStr = doc.expiryDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(doc.expiryDate)
  expiry.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
  const urgency = daysLeft <= 7 ? '#dc2626' : daysLeft <= 30 ? '#d97706' : '#1e293b'
  const urgencyBg = daysLeft <= 7 ? '#fef2f2' : daysLeft <= 30 ? '#fffbeb' : '#f8fafc'

  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Document Expiry Reminder</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">A document for the ${familyName} family is expiring soon.</p>

    <div style="background:${urgencyBg};border:1px solid ${urgency}33;border-radius:6px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1e293b">${doc.title}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">${doc.category}</p>
      <p style="margin:12px 0 0;font-size:14px;color:${urgency};font-weight:600">
        Expires: ${expiryStr} (${daysLeft <= 0 ? 'EXPIRED' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`})
      </p>
    </div>

    <p style="margin:0;color:#64748b;font-size:14px">Log in to HomeBase to review or renew this document.</p>
  `
  return baseLayout('Document Expiry Reminder', body)
}

export function billReminderHtml(bill: {
  name: string
  amount: number
  nextDueDate: Date
  reminderDays: number
  frequency: string
  notes: string | null
}, recipientName: string, completeUrl: string): string {
  const dueStr = bill.nextDueDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const daysText = bill.reminderDays === 1 ? 'tomorrow' : `in ${bill.reminderDays} days`
  const amount = formatCurrency(bill.amount)

  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Bill Due Soon</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">Hi ${recipientName}, a bill is due ${daysText}.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1e293b">${bill.name}</p>
      <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#1e293b">${amount}</p>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b">
        Due: <strong style="color:#1e293b">${dueStr}</strong> &nbsp;·&nbsp; ${bill.frequency}
      </p>
      ${bill.notes ? `<p style="margin:10px 0 0;color:#475569;font-size:13px">${bill.notes}</p>` : ''}
    </div>

    <div style="text-align:center;margin:0 0 24px">
      <a href="${completeUrl}" style="display:inline-block;padding:14px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600">✓ Mark as Paid</a>
    </div>

    <p style="margin:0;color:#94a3b8;font-size:13px">Or log in to HomeBase to record the full payment details.</p>
  `
  return baseLayout('Bill Reminder', body)
}

export function passwordResetHtml(userName: string, resetUrl: string): string {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Password Reset Request</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">Hi ${userName}, we received a request to reset your HomeBase password.</p>

    <p style="margin:0 0 24px;color:#475569;font-size:14px">Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>

    <div style="text-align:center;margin:32px 0">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#1e293b;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600">Reset Password</a>
    </div>

    <p style="margin:0;color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `
  return baseLayout('Reset your HomeBase password', body)
}

export function recipeShareHtml(recipe: {
  title: string
  description: string | null
  ingredients: string[]
  instructions: string[]
  notes: string | null
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  sourceUrl: string | null
}, senderName: string, message?: string): string {
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)
  function fmtTime(m: number) {
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60), rem = m % 60
    return rem > 0 ? `${h} hr ${rem} min` : `${h} hr`
  }

  const metaItems = [
    recipe.prepTime ? `Prep: ${fmtTime(recipe.prepTime)}` : null,
    recipe.cookTime ? `Cook: ${fmtTime(recipe.cookTime)}` : null,
    totalTime > 0 ? `Total: ${fmtTime(totalTime)}` : null,
    recipe.servings ? `Serves: ${recipe.servings}` : null,
  ].filter(Boolean)

  const ingredientsHtml = recipe.ingredients.map(i =>
    `<li style="margin:4px 0;color:#334155;font-size:14px">${i}</li>`
  ).join('')

  const instructionsHtml = recipe.instructions.map((step, idx) =>
    `<li style="margin:10px 0;color:#334155;font-size:14px"><strong style="color:#1e293b">${idx + 1}.</strong> ${step}</li>`
  ).join('')

  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">${senderName} shared a recipe with you</h2>
    ${message ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;font-style:italic">"${message}"</p>` : '<p style="margin:0 0 24px"></p>'}

    <div style="border-bottom:2px solid #e2e8f0;padding-bottom:20px;margin-bottom:24px">
      <h1 style="margin:0 0 8px;font-size:24px;color:#1e293b">${recipe.title}</h1>
      ${recipe.description ? `<p style="margin:0 0 12px;color:#64748b;font-size:15px">${recipe.description}</p>` : ''}
      ${metaItems.length > 0 ? `<p style="margin:0;font-size:13px;color:#94a3b8">${metaItems.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>` : ''}
    </div>

    <h3 style="margin:0 0 12px;font-size:16px;color:#1e293b">Ingredients</h3>
    <ul style="margin:0 0 24px;padding-left:20px">${ingredientsHtml}</ul>

    <h3 style="margin:0 0 12px;font-size:16px;color:#1e293b">Instructions</h3>
    <ol style="margin:0 0 24px;padding-left:20px">${instructionsHtml}</ol>

    ${recipe.notes ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin-bottom:24px">
        <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b">Notes</h3>
        <p style="margin:0;color:#475569;font-size:14px;white-space:pre-line">${recipe.notes}</p>
      </div>
    ` : ''}

    ${recipe.sourceUrl ? `<p style="margin:0;font-size:13px;color:#94a3b8">Original recipe: <a href="${recipe.sourceUrl}" style="color:#3b82f6">${recipe.sourceUrl}</a></p>` : ''}
  `
  return baseLayout(`Recipe: ${recipe.title}`, body)
}
