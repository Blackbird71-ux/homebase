'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const params = useSearchParams()
  const prefillCode = params.get('code') ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState(prefillCode)
  const [isFirst, setIsFirst] = useState(!prefillCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, familyName, inviteCode }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
    } else {
      router.push('/login?registered=1')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold">🏠 Homebase</h1>
          <p className="text-sm text-muted-foreground mt-1">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          {isFirst ? (
            <div className="space-y-1">
              <Label htmlFor="familyName">Family name</Label>
              <Input id="familyName" placeholder="e.g. The Liddles"
                value={familyName} onChange={e => setFamilyName(e.target.value)} required />
              <p className="text-xs text-muted-foreground">
                You&apos;re the first user — you&apos;ll be the admin.{' '}
                <button type="button" className="underline"
                  onClick={() => setIsFirst(false)}>Have an invite code?</button>
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input id="inviteCode" value={inviteCode}
                onChange={e => setInviteCode(e.target.value)} required />
              <p className="text-xs text-muted-foreground">
                <button type="button" className="underline"
                  onClick={() => setIsFirst(true)}>No invite? Start a new family</button>
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
