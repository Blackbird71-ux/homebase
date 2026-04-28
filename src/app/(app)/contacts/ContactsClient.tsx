'use client'

import { useState } from 'react'
import { PlusIcon, PhoneIcon, MailIcon, MapPinIcon, Trash2Icon, PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'

interface Contact {
  id: string
  name: string
  category: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface ContactsClientProps {
  initialContacts: Contact[]
}

const CATEGORIES = [
  { value: 'emergency', label: '🚨 Emergency', color: 'text-red-500' },
  { value: 'doctor', label: '🏥 Doctor', color: 'text-blue-500' },
  { value: 'school', label: '📚 School', color: 'text-green-500' },
  { value: 'tradesperson', label: '🔧 Tradesperson', color: 'text-amber-500' },
  { value: 'other', label: '📋 Other', color: 'text-muted-foreground' },
]

const CATEGORY_ICONS: Record<string, string> = {
  emergency: '🚨',
  doctor: '🏥',
  school: '📚',
  tradesperson: '🔧',
  other: '📋',
}

export function ContactsClient({ initialContacts }: ContactsClientProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditingContact(null)
    setName('')
    setCategory('other')
    setPhone('')
    setEmail('')
    setAddress('')
    setNotes('')
    setDialogOpen(true)
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact)
    setName(contact.name)
    setCategory(contact.category)
    setPhone(contact.phone ?? '')
    setEmail(contact.email ?? '')
    setAddress(contact.address ?? '')
    setNotes(contact.notes ?? '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        category,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
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

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setContacts((prev) => prev.filter((c) => c.id !== id))
      toast.success('Contact deleted')
    } catch {
      toast.error('Failed to delete contact')
    }
  }

  // Group contacts by category
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    contacts: contacts.filter((c) => c.category === cat.value),
  })).filter((g) => g.contacts.length > 0)

  return (
    <div className="space-y-6">
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
        grouped.map((group) => (
          <div key={group.value}>
            <h3 className={`text-sm font-semibold mb-2 ${group.color}`}>
              {group.label} ({group.contacts.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.contacts.map((contact) => (
                <Card key={contact.id} className="group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <span>{CATEGORY_ICONS[contact.category] ?? '📋'}</span>
                        {contact.name}
                      </CardTitle>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(contact)}
                          className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                          aria-label="Edit contact"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                          aria-label="Delete contact"
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
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
                      <p className="text-[10px] text-muted-foreground/60 italic mt-1">{contact.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
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
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger id="contact-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingContact ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
