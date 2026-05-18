'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, AlertCircle, Copy, RefreshCw, Check } from 'lucide-react'

interface InviteCode {
  id: string
  code: string
  used: boolean
  usedBy: string | null
  createdAt: string
  expiresAt: string | null
}

interface FamilyMember {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

interface AccountTabProps {
  user: {
    id: string
    name: string
    email: string
    role: string
    family: {
      id: string
      name: string
      timezone: string
    }
  }
  supportedTimezones: string[]
}

type Status = { type: 'success' | 'error'; message: string } | null

export function AccountTab({ user, supportedTimezones }: AccountTabProps) {
  const isAdmin = user.role === 'admin'
  const router = useRouter()

  // Profile
  const [name, setName] = useState(user.name)
  const [nameStatus, setNameStatus] = useState<Status>(null)
  const [nameSaving, setNameSaving] = useState(false)

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<Status>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Family name (admin only)
  const [familyName, setFamilyName] = useState(user.family.name)
  const [familyNameStatus, setFamilyNameStatus] = useState<Status>(null)
  const [familyNameSaving, setFamilyNameSaving] = useState(false)

  // Timezone (admin only)
  const [timezone, setTimezone] = useState(user.family.timezone)
  const [timezoneStatus, setTimezoneStatus] = useState<Status>(null)
  const [timezoneSaving, setTimezoneSaving] = useState(false)

  // Invite codes (admin only)
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCodesLoaded, setInviteCodesLoaded] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<Status>(null)

  // Members (admin only)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<FamilyMember | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetStatus, setResetStatus] = useState<Status>(null)

  // Clipboard feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  async function saveName() {
    if (!name.trim()) return
    setNameSaving(true)
    setNameStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.ok) {
        setNameStatus({ type: 'success', message: 'Name updated.' })
      } else {
        const data = await res.json()
        setNameStatus({ type: 'error', message: data.error ?? 'Failed to update name.' })
      }
    } catch {
      setNameStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setNameSaving(false)
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'All password fields are required.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 8 characters.' })
      return
    }
    setPasswordSaving(true)
    setPasswordStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPasswordStatus({ type: 'success', message: 'Password updated.' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const data = await res.json()
        setPasswordStatus({ type: 'error', message: data.error ?? 'Failed to update password.' })
      }
    } catch {
      setPasswordStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setPasswordSaving(false)
    }
  }

  async function saveFamilyName() {
    if (!familyName.trim()) return
    setFamilyNameSaving(true)
    setFamilyNameStatus(null)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: familyName.trim() }),
      })
      if (res.ok) {
        setFamilyNameStatus({ type: 'success', message: 'Family name updated.' })
      } else {
        const data = await res.json()
        setFamilyNameStatus({ type: 'error', message: data.error ?? 'Failed to update family name.' })
      }
    } catch {
      setFamilyNameStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setFamilyNameSaving(false)
    }
  }

  async function saveTimezone() {
    setTimezoneSaving(true)
    setTimezoneStatus(null)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      })
      if (res.ok) {
        router.refresh()
        setTimezoneStatus({ type: 'success', message: 'Timezone updated. All date/time displays now use the new timezone.' })
      } else {
        const data = await res.json()
        setTimezoneStatus({ type: 'error', message: data.error ?? 'Failed to update timezone.' })
      }
    } catch {
      setTimezoneStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setTimezoneSaving(false)
    }
  }

  async function loadInviteCodes() {
    try {
      const res = await fetch('/api/invite')
      if (res.ok) {
        setInviteCodes(await res.json())
        setInviteCodesLoaded(true)
      } else {
        setInviteStatus({ type: 'error', message: 'Failed to load invite codes.' })
      }
    } catch {
      setInviteStatus({ type: 'error', message: 'Network error loading invite codes.' })
    }
  }

  async function generateInvite() {
    setInviteLoading(true)
    setInviteStatus(null)
    try {
      const res = await fetch('/api/invite', { method: 'POST' })
      if (res.ok) {
        const newCode = await res.json()
        setInviteStatus({ type: 'success', message: `Invite code generated: ${newCode.code}` })
        setInviteCodesLoaded(true)
        const listRes = await fetch('/api/invite')
        if (listRes.ok) setInviteCodes(await listRes.json())
      } else {
        setInviteStatus({ type: 'error', message: 'Failed to generate invite code.' })
      }
    } catch {
      setInviteStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setInviteLoading(false)
    }
  }

  async function loadMembers() {
    setMembersError(null)
    try {
      const res = await fetch('/api/family/members')
      if (res.ok) {
        setMembers(await res.json())
        setMembersLoaded(true)
      } else {
        setMembersError('Failed to load members.')
      }
    } catch {
      setMembersError('Network error loading members.')
    }
  }

  async function resetMemberPassword() {
    if (!resetTarget || !resetPassword) return
    if (resetPassword.length < 8) {
      setResetStatus({ type: 'error', message: 'Password must be at least 8 characters.' })
      return
    }
    setResetSaving(true)
    setResetStatus(null)
    try {
      const res = await fetch(`/api/family/members/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      if (res.ok) {
        setResetStatus({ type: 'success', message: `Password reset for ${resetTarget.name}.` })
        setResetPassword('')
        setTimeout(() => { setResetTarget(null); setResetStatus(null) }, 2000)
      } else {
        const data = await res.json()
        setResetStatus({ type: 'error', message: data.error ?? 'Failed to reset password.' })
      }
    } catch {
      setResetStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setResetSaving(false)
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(text)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      // clipboard not available (non-HTTPS or no focus)
    }
  }

  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        {isAdmin && <TabsTrigger value="family">Family</TabsTrigger>}
      </TabsList>

      {/* ── PROFILE TAB ── */}
      <TabsContent value="profile" className="space-y-6">

      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>Update the name shown to other family members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <p className="text-xs text-muted-foreground">Email: {user.email}</p>
          <Button onClick={saveName} disabled={nameSaving || !name.trim()}>
            {nameSaving ? 'Saving...' : 'Save Name'}
          </Button>
          {nameStatus && <StatusMessage status={nameStatus} />}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Enter your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input id="current-password" type="password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
          </div>
          <Button onClick={savePassword} disabled={passwordSaving}>
            {passwordSaving ? 'Updating...' : 'Update Password'}
          </Button>
          {passwordStatus && <StatusMessage status={passwordStatus} />}
        </CardContent>
      </Card>

      {/* Timezone — read-only for non-admins */}
      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Timezone</CardTitle>
            <CardDescription>The timezone used for all dates and times in the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{user.family.timezone.replace(/_/g, ' ')}</p>
          </CardContent>
        </Card>
      )}

      </TabsContent>

      {/* ── FAMILY TAB (admin only) ── */}
      {isAdmin && (
      <TabsContent value="family" className="space-y-6">

      {/* Admin: Family Name */}
      <Card>
          <CardHeader>
            <CardTitle>Family Name</CardTitle>
            <CardDescription>Admin only — changes the name shown in the app header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family Name</Label>
              <Input id="family-name" value={familyName} onChange={e => setFamilyName(e.target.value)}
                placeholder="Family name" />
            </div>
            <Button onClick={saveFamilyName} disabled={familyNameSaving || !familyName.trim()}>
              {familyNameSaving ? 'Saving...' : 'Save Family Name'}
            </Button>
            {familyNameStatus && <StatusMessage status={familyNameStatus} />}
          </CardContent>
        </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Admin only — sets the timezone used for all dates and times across the app.'
              : 'The timezone used for all dates and times in the app.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAdmin ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <select id="timezone" value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
                  {supportedTimezones.map(tz => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <Button onClick={saveTimezone} disabled={timezoneSaving}>
                {timezoneSaving ? 'Saving...' : 'Save Timezone'}
              </Button>
              {timezoneStatus && <StatusMessage status={timezoneStatus} />}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Admin: Invite Codes */}
      <Card>
          <CardHeader>
            <CardTitle>Invite Codes</CardTitle>
            <CardDescription>Generate codes to invite new family members. Codes expire in 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={generateInvite} disabled={inviteLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {inviteLoading ? 'Generating...' : 'Generate Invite Code'}
              </Button>
              {!inviteCodesLoaded && (
                <Button variant="outline" onClick={loadInviteCodes}>Load History</Button>
              )}
            </div>
            {inviteStatus && <StatusMessage status={inviteStatus} />}
            {inviteCodesLoaded && inviteCodes.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {inviteCodes.map(code => (
                  <div key={code.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{code.code}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${code.used ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
                        {code.used ? 'Used' : 'Active'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {code.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          Expires {new Date(code.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      {!code.used && (
                        <button onClick={() => copyToClipboard(code.code)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Copy invite code">
                          {copiedCode === code.code
                            ? <Check className="h-3.5 w-3.5 text-green-500" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {inviteCodesLoaded && inviteCodes.length === 0 && (
              <p className="text-sm text-muted-foreground">No invite codes generated yet.</p>
            )}
          </CardContent>
        </Card>

      {/* Admin: Family Members */}
      <Card>
          <CardHeader>
            <CardTitle>Family Members</CardTitle>
            <CardDescription>All accounts with access to your family&apos;s Homebase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {membersError && <p className="text-sm text-destructive">{membersError}</p>}
            {!membersLoaded && (
              <Button variant="outline" onClick={loadMembers}>
                {membersError ? 'Retry' : 'Load Members'}
              </Button>
            )}
            {membersLoaded && members.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {members.map(member => (
                  <div key={member.id}>
                    <div className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {member.role}
                        </span>
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => {
                            setResetTarget(resetTarget?.id === member.id ? null : member)
                            setResetPassword('')
                            setResetStatus(null)
                          }}>
                          Reset Password
                        </Button>
                      </div>
                    </div>
                    {resetTarget?.id === member.id && (
                      <div className="px-3 pb-3 space-y-2 bg-muted/30">
                        <p className="text-xs text-muted-foreground pt-2">Set a new password for {member.name}:</p>
                        <div className="flex gap-2">
                          <Input type="password" value={resetPassword}
                            onChange={e => setResetPassword(e.target.value)}
                            placeholder="New password (min 8 chars)" className="h-8 text-sm" />
                          <Button size="sm" onClick={resetMemberPassword} disabled={resetSaving || !resetPassword}>
                            {resetSaving ? 'Saving...' : 'Set'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setResetTarget(null); setResetStatus(null) }}>
                            Cancel
                          </Button>
                        </div>
                        {resetStatus && <StatusMessage status={resetStatus} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </TabsContent>
      )}

    </Tabs>
  )
}

function StatusMessage({ status }: { status: { type: 'success' | 'error'; message: string } }) {
  return (
    <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
      {status.type === 'success'
        ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
        : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
      <span>{status.message}</span>
    </div>
  )
}
