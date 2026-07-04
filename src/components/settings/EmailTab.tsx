'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, BellIcon } from 'lucide-react'
import { toast } from 'sonner'

interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  fromEmail: string
}

export function EmailTab() {
  const [config, setConfig] = useState<SmtpConfig>({
    host: '',
    port: 587,
    username: '',
    password: '',
    fromEmail: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sendingReminders, setSendingReminders] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('Failed to load settings')
      const data = await res.json()
      const smtp = data.uiPreferences?.smtp as SmtpConfig | undefined
      if (smtp) {
        setConfig({
          host: smtp.host || '',
          port: smtp.port || 587,
          username: smtp.username || '',
          password: smtp.password || '',
          fromEmail: smtp.fromEmail || '',
        })
      }
    } catch (err) {
      console.error('Failed to load email config:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!config.host || !config.username) {
      toast.error('SMTP Host and Username are required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uiPreferences: {
            smtp: config,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to save')
      toast.success('Email settings saved')
    } catch {
      toast.error('Failed to save email settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendReminders() {
    setSendingReminders(true)
    setReminderResult(null)
    try {
      const res = await fetch('/api/reminders/process', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        const { sent } = data as { sent: { chores: number; events: number; documents: number } }
        setReminderResult({
          success: true,
          message: `Sent ${sent.chores} chore, ${sent.events} event, and ${sent.documents} document reminder(s).`,
        })
      } else {
        setReminderResult({ success: false, message: data?.error ?? 'Failed to process reminders' })
      }
    } catch {
      setReminderResult({ success: false, message: 'Network error' })
    } finally {
      setSendingReminders(false)
    }
  }

  async function handleTest() {
    if (!testEmail) {
      toast.error('Please enter a test email address')
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      })
      const data = await res.json().catch(() => null)
      setTestResult({
        success: res.ok,
        message: data?.message || data?.error || 'Test completed',
      })
    } catch {
      setTestResult({ success: false, message: 'Network error' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Email Configuration</CardTitle>
              <CardDescription>
                Configure SMTP settings for sending emails (PIN resets, notifications, etc.).
                For Gmail, use an App Password generated from your Google Account settings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">SMTP Port</Label>
              <Input
                id="smtp-port"
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 587 })}
                placeholder="587"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-username">SMTP Username (email address)</Label>
            <Input
              id="smtp-username"
              type="email"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="your.email@gmail.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-password">SMTP Password (App Password for Gmail)</Label>
            <div className="relative">
              <Input
                id="smtp-password"
                type={showPassword ? 'text' : 'password'}
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="Your app password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              For Gmail: Enable 2FA, then generate an App Password at myaccount.google.com/apppasswords
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-from">From Email (optional)</Label>
            <Input
              id="smtp-from"
              type="email"
              value={config.fromEmail}
              onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
              placeholder="homebase@yourdomain.com"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the SMTP username as the sender address.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test Email</CardTitle>
          <CardDescription>
            Send a test email to verify your configuration is working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="test-email">Send test to</Label>
            <div className="flex gap-2">
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your.email@gmail.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || !testEmail}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Send Test'
                )}
              </Button>
            </div>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${
              testResult.success
                ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30'
                : 'text-destructive bg-destructive/10'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Reminders</CardTitle>
              <CardDescription>
                Reminders run automatically at 8:00 AM daily. Use this button to trigger them immediately.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleSendReminders} disabled={sendingReminders}>
            {sendingReminders ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              'Send Reminders Now'
            )}
          </Button>
          {reminderResult && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${
              reminderResult.success
                ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30'
                : 'text-destructive bg-destructive/10'
            }`}>
              {reminderResult.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{reminderResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
