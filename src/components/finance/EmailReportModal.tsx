'use client'

import { useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentFY } from '@/lib/financeReport'

interface EmailReportModalProps {
  open: boolean
  onClose: () => void
  familyId: string
}

export default function EmailReportModal({ open, onClose }: EmailReportModalProps) {
  const [year, setYear] = useState(getCurrentFY())
  const [recipientsText, setRecipientsText] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  if (!open) return null

  function parseRecipients(text: string): string[] {
    return text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'))
  }

  async function handleSend() {
    const recipients = parseRecipients(recipientsText)
    if (recipients.length === 0) {
      toast.error('Enter at least one valid email address')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/finance/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          recipients,
          note: note || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send email')
      }

      const data = await res.json()
      toast.success(`Report sent to ${data.recipients} recipient(s)`)
      onClose()
      setRecipientsText('')
      setNote('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Email Report</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Year selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Financial Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value={getCurrentFY()}>{getCurrentFY()}</option>
              <option value={`${Number(getCurrentFY().slice(0, 4)) - 1}-${getCurrentFY().slice(2, 4)}`}>
                {Number(getCurrentFY().slice(0, 4)) - 1}-{getCurrentFY().slice(2, 4)}
              </option>
            </select>
          </div>

          {/* Recipients */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Recipients <span className="text-red-500">*</span>
            </label>
            <textarea
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              placeholder="email@example.com, partner@example.com"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate multiple emails with commas, semicolons, or new lines.
            </p>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Note <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a personal message to the email..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sending ? 'Sending...' : 'Send Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
