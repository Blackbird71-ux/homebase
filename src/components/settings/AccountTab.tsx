'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Copy, RefreshCw } from 'lucide-react'

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
    }
  }
}

type Status = { type: 'success' | 'error'; message: string } | null

export function AccountTab({ user }: AccountTabProps) {
  const isAdmin = user.role === 'admin'

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

  // Invite codes (admin only)
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCodesLoaded, setInviteCodesLoaded] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<Status>(null)

  // Members (admin only)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)

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

  async function loadInviteCodes() {
    setInviteCodesLoaded(true)
    const res = await fetch('/api/invite')
    if (res.ok) setInviteCodes(await res.json())
  }

  async function generateInvite() {
    setInviteLoading(true)
    setInviteStatus(null)
    try {
      const res = await fetch('/api/invite', { method: 'POST' })
      if (res.ok) {
        const newCode = await res.json()
        setInviteCodes(prev => [
          { ...newCode, used: false, usedBy: null, id: newCode.code, createdAt: new Date().toISOString() },
          ...prev,
        ])
        setInviteStatus({ type: 'success', message: `Invite code generated: ${newCode.code}` })
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
    setMembersLoaded(true)
    const res = await fetch('/api/family/members')
    if (res.ok) setMembers(await res.json())
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
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
          {nameStatus && (
            <StatusMessage status={nameStatus} />
          )}
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
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Button onClick={savePassword} disabled={passwordSaving}>
            {passwordSaving ? 'Updating...' : 'Update Password'}
          </Button>
          {passwordStatus && <StatusMessage status={passwordStatus} />}
        </CardContent>
      </Card>

      {/* Admin: Family Name */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Family Name</CardTitle>
            <CardDescription>Admin only — changes the name shown in the app header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family Name</Label>
              <Input
                id="family-name"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                placeholder="Family name"
              />
            </div>
            <Button onClick={saveFamilyName} disabled={familyNameSaving || !familyName.trim()}>
              {familyNameSaving ? 'Saving...' : 'Save Family Name'}
            </Button>
            {familyNameStatus && <StatusMessage status={familyNameStatus} />}
          </CardContent>
        </Card>
      )}

      {/* Admin: Invite Codes */}
      {isAdmin && (
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
                <Button variant="outline" onClick={loadInviteCodes}>
                  Load History
                </Button>
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
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
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
      )}

      {/* Admin: Family Members */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Family Members</CardTitle>
            <CardDescription>All accounts with access to your family&apos;s Homebase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!membersLoaded && (
              <Button variant="outline" onClick={loadMembers}>
                Load Members
              </Button>
            )}
            {membersLoaded && members.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
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
