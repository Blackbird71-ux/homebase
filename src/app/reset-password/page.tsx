'use client'

import { useState, useTransition, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        Invalid reset link. Please{' '}
        <Link href="/forgot-password" className="underline">request a new one</Link>.
      </p>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Something went wrong. Please try again.')
          return
        }
        router.push('/login?reset=1')
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : 'Set new password'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold">🏠 Homebase</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose a new password</p>
        </div>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="text-sm text-center text-muted-foreground">
          <Link href="/login" className="underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
