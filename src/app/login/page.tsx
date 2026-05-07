'use client'

import { useState, useTransition, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

function LoginForm() {
  const searchParams = useSearchParams()
  const justReset = searchParams.get('reset') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const err = await loginAction(email, password)
      if (err) setError(err)
    })
  }

  return (
    <>
      {justReset && (
        <p className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
          Password updated successfully. Sign in below.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold">🏠 Homebase</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your family account</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-center text-muted-foreground">
          Need an account?{' '}
          <Link href="/register" className="underline">Register</Link>
        </p>
      </div>
    </div>
  )
}
