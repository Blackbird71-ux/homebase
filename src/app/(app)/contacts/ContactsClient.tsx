'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PhoneIcon, MailIcon, MapPinIcon, Trash2Icon, PencilIcon, LockIcon, UnlockIcon, ShieldCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PillNav } from '@/components/shared/PillNav'
import { toast } from 'sonner'
import { SecureUnlockDialog } from '@/components/shared/SecureUnlockDialog'

interface Contact {
  id: string
  name: string
  category: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  pinHash: string | null
  createdAt: string
  updatedAt: string
}

interface ContactsClientProps {
  initialContacts: Contact[]
}

const BUILT_IN_CATEGORIES = [
  { value: 'family',      label: '👨‍👩‍👧 Family',       color: 'text-pink-500' },
  { value: 'emergency',   label: '🚨 Emergency',    color: 'text-red-500' },
  { value: 'doctor',      label: '🏥 Doctor',        color: 'text-blue-500' },
  { value: 'school',      label: '📚 School',        color: 'text-green-500' },
  { value: 'tradesperson',label: '🔧 Tradesperson',  color: 'text-amber-500' },
  { value: 'other',       label: '📋 Other',         color: 'text-muted-foreground' },
]

const BUILT_IN_ICONS: Record<string, string> = {
  family:      '👨‍👩‍👧',
  emergency:   '🚨',
  doctor:      '🏥',
  school:      '📚',
  tradesperson:'🔧',
  other:       '📋',
}

function getCategoryLabel(value: string): string {
  const found = BUILT_IN_CATEGORIES.find((c) => c.value === value)
  if (found) return found.label
  // Custom category: capitalise first letter
  return '🏷️ ' + value.charAt(0).toUpperCase() + value.slice(1)
}

function getCategoryColor(value: string): string {
  return BUILT_IN_CATEGORIES.find((c) => c.value === value)?.color ?? 'text-violet-500'
}

function getCategoryIcon(value: string): string {
  return BUILT_IN_ICONS[value] ?? '🏷️'
}

export function ContactsClient({ initialContacts }: ContactsClientProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')
  const [customCategory, setCustomCategory] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [pin, setPin] = useState('')
  const [pinEnabled, setPinEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  // Unlock state
  const [unlockContact, setUnlockContact] = useState<Contact | null>(null)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())

  // Lock a contact by calling the lock API and updating local state
  const handleLock = useCallback(async (contactId: string) => {
    try {
      await fetch(`/api/contacts/${contactId}/lock`, { method: 'POST' })
    } catch {
      // Silently fail
    }
    setUnlockedIds((prev) => {
      const next = new Set(prev)
      next.delete(contactId)
      return next
    })
  }, [])

  // Lock all unlocked contacts when the component unmounts (user navigates away)
  // or page is refreshed/closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      unlockedIds.forEach((id) => {
        navigator.sendBeacon(`/api/contacts/${id}/lock`, '')
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Fire-and-forget: lock all currently unlocked contacts
      unlockedIds.forEach((id) => {
        fetch(`/api/contacts/${id}/lock`, { method: 'POST' }).catch(() => {})
      })
    }
  }, [unlockedIds])

  // Derive the full list of categories to show (built-ins + any custom ones already in use)
  const customCatsInUse = [...new Set(
    contacts
      .map((c) => c.category)
      .filter((v) => !BUILT_IN_CATEGORIES.some((b) => b.value === v))
  )]

  function resolvedCategory() {
    return category === '__custom__' ? customCategory.trim().toLowerCase() : category
  }

  function openNew() {
    setEditingContact(null)
    setName('')
    setCategory('other')
    setCustomCategory('')
    setPhone('')
    setEmail('')
    setAddress('')
    setNotes('')
    setPin('')
    setPinEnabled(false)
    setDialogOpen(true)
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact)
    setName(contact.name)
    const isBuiltIn = BUILT_IN_CATEGORIES.some((b) => b.value === contact.category)
    if (isBuiltIn) {
      setCategory(contact.category)
      setCustomCategory('')
    } else {
      setCategory('__custom__')
      setCustomCategory(contact.category)
    }
    setPhone(contact.phone ?? '')
    setEmail(contact.email ?? '')
    setAddress(contact.address ?? '')
    setNotes(contact.notes ?? '')
    setPin('')
    setPinEnabled(!!contact.pinHash)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const finalCategory = resolvedCategory()
    if (!finalCategory) {
      toast.error('Please enter a category name')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        category: finalCategory,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }

      // Handle PIN
      if (pinEnabled) {
        if (pin) {
          body.pin = pin
        }
        // If editing and pinEnabled but no new pin provided, keep existing pin
      }

      const url = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts'
      const method = editingContact ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to save contact')
      const saved = await res.json()

      if (editingContact) {
        setContacts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
      } else {
        setContacts((prev) => [...prev, saved])
      }

      setDialogOpen(false)
      toast.success(editingContact ? 'Contact updated' : 'Contact created')
    } catch {
      toast.error('Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setContacts((prev) => prev.filter((c) => c.id !== id))
      toast.success('Contact deleted')
    } catch {
      toast.error('Failed to delete contact')
    }
  }

  const handleUnlocked = useCallback((contactId: string) => {
    setUnlockedIds((prev) => new Set(prev).add(contactId))
  }, [])

  // Group contacts by category — built-ins first (in order), then custom cats alphabetically
  const allCategoryValues = [
    ...BUILT_IN_CATEGORIES.map((c) => c.value),
    ...customCatsInUse.sort(),
  ]
  const grouped = allCategoryValues
    .map((val) => ({
      value: val,
      label: getCategoryLabel(val),
      color: getCategoryColor(val),
      contacts: contacts.filter((c) => c.category === val),
    }))
    .filter((g) => g.contacts.length > 0)

  // Derive tab values: "all" plus each category
  const tabValues = ['all', ...grouped.map((g) => g.value)]

  // Default to first tab that has contacts, or "all"
  const [activeTab, setActiveTab] = useState('all')

  // Render a single contact card
  function renderContactCard(contact: Contact) {
    const isSecured = !!contact.pinHash
    const isUnlocked = unlockedIds.has(contact.id)

    return (
      <Card key={contact.id} className={`group ${isSecured && !isUnlocked ? 'relative overflow-hidden' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <span>{getCategoryIcon(contact.category)}</span>
              {contact.name}
              {isSecured && (
                <ShieldCheckIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}
            </CardTitle>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {isSecured && !isUnlocked && (
                <button
                  onClick={() => setUnlockContact(contact)}
                  className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                  aria-label="Unlock contact"
                >
                  <LockIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {isSecured && isUnlocked && (
                <button
                  onClick={() => handleLock(contact.id)}
                  className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                  aria-label="Lock contact"
                >
                  <UnlockIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => openEdit(contact)}
                className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                aria-label="Edit contact"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(contact.id, contact.name)}
                className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                aria-label="Delete contact"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {isSecured && !isUnlocked ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <LockIcon className="h-5 w-5 text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground/60">PIN required to view details</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => setUnlockContact(contact)}
              >
                <UnlockIcon className="h-3 w-3 mr-1" />
                Unlock
              </Button>
            </div>
          ) : (
            <>
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <PhoneIcon className="h-3 w-3 shrink-0" />
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <MailIcon className="h-3 w-3 shrink-0" />
                  {contact.email}
                </a>
              )}
              {contact.address && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPinIcon className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{contact.address}</span>
                </div>
              )}
              {contact.notes && (
                <p className="text-xs text-muted-foreground/60 italic mt-1">{contact.notes}</p>
              )}
              {isSecured && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 text-xs text-muted-foreground/60 hover:text-foreground"
                    onClick={() => handleLock(contact.id)}
                  >
                    <LockIcon className="h-3 w-3 mr-1" />
                    Lock
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  // Render a grid of contact cards (responsive columns)
  function renderGrid(contactsList: Contact[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {contactsList.map(renderContactCard)}
      </div>
    )
  }

  // Get filtered list for the active tab
  function contactsForTab(tabValue: string): Contact[] {
    if (tabValue === 'all') return contacts
    return contacts.filter((c) => c.category === tabValue)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={openNew}>
          <PlusIcon className="h-4 w-4 mr-1" /> Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No contacts yet. Add your first household contact.</p>
          </CardContent>
        </Card>
      ) : (
        <PillNav
            items={[
              { id: 'all', label: `All (${contacts.length})` },
              ...grouped.map((g) => ({ id: g.value, label: `${g.label} (${g.contacts.length})` })),
            ]}
            active={activeTab}
            onChange={setActiveTab}
            size="sm"
          />

          <div className="mt-4">
            {renderGrid(contactsForTab(activeTab))}
          </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Name</Label>
              <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-category">Category</Label>
              <Select value={category} onValueChange={(v) => { if (v) setCategory(v) }}>
                <SelectTrigger id="contact-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILT_IN_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                  {/* Custom categories already in use */}
                  {customCatsInUse.map((val) => (
                    <SelectItem key={val} value={val}>
                      🏷️ {val.charAt(0).toUpperCase() + val.slice(1)}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">✏️ Custom…</SelectItem>
                </SelectContent>
              </Select>
              {category === '__custom__' && (
                <Input
                  autoFocus
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. neighbour, vet, gym…"
                  className="mt-2"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input id="contact-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0400 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. dr.smith@clinic.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-address">Address</Label>
              <Input id="contact-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 123 Main St" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-notes">Notes</Label>
              <Input id="contact-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>

            {/* PIN Protection Toggle */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="contact-pin-toggle" className="font-medium">PIN Protection</Label>
                </div>
                <Switch
                  id="contact-pin-toggle"
                  checked={pinEnabled}
                  onCheckedChange={(checked) => {
                    setPinEnabled(checked)
                    if (!checked) setPin('')
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {pinEnabled
                  ? 'A PIN will be required to view this contact\'s details.'
                  : editingContact && !!editingContact.pinHash
                    ? 'Disable to remove PIN protection.'
                    : 'Enable to protect this contact with a PIN.'}
              </p>
              {pinEnabled && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="contact-pin">PIN</Label>
                  <Input
                    id="contact-pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder={editingContact && !!editingContact.pinHash ? 'Leave blank to keep current PIN' : 'Enter a 4-10 digit PIN'}
                    maxLength={10}
                    className="max-w-[200px]"
                  />
                  {editingContact && !!editingContact.pinHash && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep the existing PIN.</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingContact ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Dialog */}
      {unlockContact && (
        <SecureUnlockDialog
          open={!!unlockContact}
          onOpenChange={(open) => {
            if (!open) setUnlockContact(null)
          }}
          entityType="contact"
          entityId={unlockContact.id}
          entityName={unlockContact.name}
          onUnlocked={() => handleUnlocked(unlockContact.id)}
        />
      )}
    </div>
  )
}
