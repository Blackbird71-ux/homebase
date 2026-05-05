// src/lib/email.ts
// Email sending utility using nodemailer with SMTP config from uiPreferences

import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  fromEmail: string
}

/**
 * Get SMTP configuration from the admin user's uiPreferences.
 * Returns null if not configured.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { uiPreferences: true },
    })
    if (!admin?.uiPreferences) return null
    const prefs = JSON.parse(admin.uiPreferences)
    const smtp = prefs.smtp as SmtpConfig | undefined
    if (!smtp?.host || !smtp?.username || !smtp?.password) return null
    return smtp
  } catch {
    return null
  }
}

/**
 * Send an email using configured SMTP settings.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const smtp = await getSmtpConfig()
    if (!smtp) {
      return { success: false, error: 'SMTP not configured. Configure email in Settings.' }
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    })

    await transporter.sendMail({
      from: smtp.fromEmail || smtp.username,
      to,
      subject,
      html,
    })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
