// Email reminder processing: chores, events, documents, bills

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { choreReminderHtml, eventReminderHtml, documentExpiryHtml, billReminderHtml } from '@/lib/email-templates'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { generateCompleteToken } from '@/lib/complete-token'

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

async function logAndSend({
  reminderKey,
  entityType,
  to,
  subject,
  html,
}: {
  reminderKey: string
  entityType: string
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  // Skip if already sent today
  const existing = await prisma.emailReminderLog.findUnique({ where: { reminderKey } })
  if (existing) return false

  const result = await sendEmail({ to, subject, html })
  if (result.success) {
    await prisma.emailReminderLog.create({ data: { entityType, reminderKey } })
    return true
  }
  console.error(`[reminders] Failed to send ${reminderKey}:`, result.error)
  return false
}

export async function processChoreReminders(): Promise<number> {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const chores = await prisma.chore.findMany({
    where: { emailReminder: true, isActive: true, nextDueDate: { not: null } },
    include: { currentAssignee: { select: { id: true, name: true, email: true } } },
  })

  let sent = 0
  for (const chore of chores) {
    if (!chore.nextDueDate || !chore.currentAssignee?.email) continue

    const dueDate = new Date(chore.nextDueDate)
    dueDate.setHours(0, 0, 0, 0)

    const reminderDate = new Date(dueDate)
    reminderDate.setDate(reminderDate.getDate() - chore.emailReminderDays)

    // Send on the reminder date
    if (now.getTime() !== reminderDate.getTime()) continue

    const dueDateKey = chore.nextDueDate.toISOString().split('T')[0]
    const reminderKey = `chore_${chore.id}_${dueDateKey}`

    const appUrl = process.env.NEXTAUTH_URL ?? ''
    const token = generateCompleteToken('chore', chore.id, chore.currentAssignee.id)
    const completeUrl = `${appUrl}/api/complete?token=${token}`

    const ok = await logAndSend({
      reminderKey,
      entityType: 'chore',
      to: chore.currentAssignee.email,
      subject: `Reminder: "${chore.title}" is due soon`,
      html: choreReminderHtml(
        {
          title: chore.title,
          description: chore.description,
          frequency: chore.frequency,
          nextDueDate: chore.nextDueDate,
          emailReminderDays: chore.emailReminderDays,
        },
        chore.currentAssignee.name,
        completeUrl
      ),
    })
    if (ok) sent++
  }
  return sent
}

export async function processEventReminders(): Promise<number> {
  const now = new Date()

  const events = await prisma.event.findMany({
    where: { emailReminder: true },
    include: { family: { include: { users: { select: { email: true, name: true } } } } },
  })

  let sent = 0
  for (const event of events) {
    const familyName = event.family.name
    const familyEmails = event.family.users.map(u => u.email)
    const extraEmails: string[] = event.emailReminderEmails
      ? (JSON.parse(event.emailReminderEmails) as string[])
      : []
    const allEmails = [...new Set([...familyEmails, ...extraEmails])]

    // Get the next occurrence(s) to check
    let instancesToCheck: Date[] = []

    if (event.isRecurring && event.recurrenceRule) {
      const windowStart = now
      const windowEnd = new Date(now.getTime() + event.emailReminderHours * 3600000 + 86400000)
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        windowStart,
        windowEnd,
        event.family.timezone ?? 'UTC'
      )
      instancesToCheck = instances.map(i => i.start)
    } else {
      instancesToCheck = [event.start]
    }

    for (const instanceStart of instancesToCheck) {
      const reminderAt = new Date(instanceStart.getTime() - event.emailReminderHours * 3600000)
      // Send if we're within this hour's window of the reminder time
      if (now < reminderAt || now.getTime() - reminderAt.getTime() > 3600000) continue

      const instanceKey = instanceStart.toISOString().substring(0, 13) // YYYY-MM-DDTHH
      const reminderKey = `event_${event.id}_${instanceKey}`

      const instanceEvent = {
        ...event,
        start: instanceStart,
        end: new Date(instanceStart.getTime() + (event.end.getTime() - event.start.getTime())),
      }

      for (const email of allEmails) {
        const perEmailKey = `${reminderKey}_${email}`
        const ok = await logAndSend({
          reminderKey: perEmailKey,
          entityType: 'event',
          to: email,
          subject: `Reminder: "${event.title}" is coming up`,
          html: eventReminderHtml(
            {
              title: instanceEvent.title,
              description: instanceEvent.description,
              start: instanceEvent.start,
              end: instanceEvent.end,
              isAllDay: instanceEvent.isAllDay,
              category: instanceEvent.category,
            },
            familyName
          ),
        })
        if (ok) sent++
      }
    }
  }
  return sent
}

export async function processDocumentReminders(): Promise<number> {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const documents = await prisma.document.findMany({
    where: { emailReminder: true, expiryDate: { not: null } },
    include: { family: { include: { users: { select: { email: true } } } } },
  })

  let sent = 0
  for (const doc of documents) {
    if (!doc.expiryDate) continue

    const expiryDate = new Date(doc.expiryDate)
    expiryDate.setHours(0, 0, 0, 0)

    const reminderDate = new Date(expiryDate)
    reminderDate.setDate(reminderDate.getDate() - doc.remindBefore)

    if (now.getTime() !== reminderDate.getTime()) continue

    const expiryKey = doc.expiryDate.toISOString().split('T')[0]
    const familyEmails = doc.family.users.map(u => u.email)
    const familyName = doc.family.name

    for (const email of familyEmails) {
      const reminderKey = `document_${doc.id}_${expiryKey}_${email}`
      const ok = await logAndSend({
        reminderKey,
        entityType: 'document',
        to: email,
        subject: `Reminder: "${doc.title}" is expiring soon`,
        html: documentExpiryHtml(
          {
            title: doc.title,
            category: doc.category,
            expiryDate: doc.expiryDate,
            remindBefore: doc.remindBefore,
          },
          familyName
        ),
      })
      if (ok) sent++
    }
  }
  return sent
}

export async function processBillReminders(): Promise<number> {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const bills = await prisma.financeRecurringBill.findMany({
    where: { emailReminder: true, isActive: true, paid: false },
    include: {
      family: {
        include: { users: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  let sent = 0
  for (const bill of bills) {
    if (!bill.nextDueDate) continue

    const dueDate = new Date(bill.nextDueDate)
    dueDate.setHours(0, 0, 0, 0)

    const reminderDate = new Date(dueDate)
    reminderDate.setDate(reminderDate.getDate() - bill.reminderDays)

    if (now.getTime() !== reminderDate.getTime()) continue

    const dueDateKey = bill.nextDueDate.toISOString().split('T')[0]

    const memberUser = bill.memberId
      ? await prisma.user.findUnique({ where: { id: bill.memberId }, select: { id: true, name: true, email: true } })
      : null

    // Send to the assigned member if set, otherwise all family members
    const recipients: { id: string; name: string; email: string }[] = memberUser?.email
      ? [memberUser as { id: string; name: string; email: string }]
      : bill.family.users.filter((u: { id: string; name: string; email: string | null }): u is { id: string; name: string; email: string } => !!u.email)

    const appUrl = process.env.NEXTAUTH_URL ?? ''

    for (const recipient of recipients) {
      const reminderKey = `bill_${bill.id}_${dueDateKey}_${recipient.id}`
      const token = generateCompleteToken('bill', bill.id, recipient.id)
      const completeUrl = `${appUrl}/api/complete?token=${token}`

      const ok = await logAndSend({
        reminderKey,
        entityType: 'bill',
        to: recipient.email,
        subject: `Reminder: "${bill.name}" is due soon`,
        html: billReminderHtml(
          {
            name: bill.name,
            amount: bill.amount,
            nextDueDate: bill.nextDueDate,
            reminderDays: bill.reminderDays,
            frequency: bill.frequency,
            notes: bill.notes,
          },
          recipient.name,
          completeUrl
        ),
      })
      if (ok) sent++
    }
  }
  return sent
}

export async function processAllReminders(): Promise<{ chores: number; events: number; documents: number; bills: number }> {
  console.log('[reminders] Processing reminders...')
  const [chores, events, documents, bills] = await Promise.all([
    processChoreReminders(),
    processEventReminders(),
    processDocumentReminders(),
    processBillReminders(),
  ])
  console.log(`[reminders] Sent: ${chores} chore, ${events} event, ${documents} document, ${bills} bill reminders`)
  return { chores, events, documents, bills }
}
