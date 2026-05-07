'use client'

import { useState, useTransition } from 'react'
import { House } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Something went wrong. Please try again.')
          return
        }
        setSubmitted(true)
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-lg bg-foreground text-background shrink-0">
              <House className="size-5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Homebase</span>
          </div>
          <p className="text-sm text-muted-foreground">Reset your password</p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
            </p>
            <p className="text-sm text-center">
              <Link href="/login" className="underline">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
            <p className="text-sm text-center text-muted-foreground">
              <Link href="/login" className="underline">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
