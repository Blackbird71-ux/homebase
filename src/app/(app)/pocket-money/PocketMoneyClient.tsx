'use client'

import { useState, useCallback } from 'react'
import { PiggyBankIcon, FlameIcon, PlusIcon, GiftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatInTz } from '@/lib/timezone'
import type { PocketMoneySummary } from '@/lib/pocket-money'

interface WishlistOption {
  id: string
  title: string
  estimatedPrice: number | null
}

interface Props {
  initialSummary: PocketMoneySummary
  wishlistItems: WishlistOption[]
  isAdmin: boolean
  timezone: string
}

const TYPE_LABELS: Record<string, string> = {
  chore: '🧹 Chore',
  adjustment: '✏️ Adjustment',
  redemption: '🎁 Redeemed',
}

function money(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`
}

export function PocketMoneyClient({ initialSummary, wishlistItems, isAdmin, timezone }: Props) {
  const [summary, setSummary] = useState(initialSummary)
  const [drawerMode, setDrawerMode] = useState<'adjust' | 'redeem' | null>(null)
  const [saving, setSaving] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [wishlistItemId, setWishlistItemId] = useState('')

  const openDrawer = (mode: 'adjust' | 'redeem', forMemberId: string) => {
    setMemberId(forMemberId)
    setAmount('')
    setNote('')
    setWishlistItemId('')
    setDrawerMode(mode)
  }

  const refresh = useCallback(async () => {
    const res = await fetch('/api/pocket-money')
    if (res.ok) setSummary(await res.json())
  }, [])

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(amount)
    if (!memberId) { toast.error('Pick a family member'); return }
    if (!Number.isFinite(parsed) || parsed === 0) { toast.error('Enter an amount'); return }
    if (drawerMode === 'redeem' && parsed <= 0) { toast.error('Amount must be positive'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/pocket-money/${drawerMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: memberId,
          amount: parsed,
          note: note.trim() || null,
          ...(drawerMode === 'redeem' && wishlistItemId ? { wishlistItemId } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Something went wrong')
        return
      }
      toast.success(drawerMode === 'redeem' ? 'Redeemed!' : 'Balance updated')
      setDrawerMode(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }, [drawerMode, memberId, amount, note, wishlistItemId, refresh])

  // Selecting a wishlist item pre-fills the amount with its estimated price.
  const pickWishlistItem = (id: string) => {
    setWishlistItemId(id)
    const item = wishlistItems.find(w => w.id === id)
    if (item?.estimatedPrice != null && !amount) setAmount(String(item.estimatedPrice))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <PiggyBankIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Pocket Money</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Balances */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {summary.members.map(m => (
            <Card key={m.id}>
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-2xl font-semibold mt-1">
                      {m.balance < 0 ? '-' : ''}{money(m.balance)}
                    </p>
                  </div>
                  {m.streak > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 text-orange-600 px-2 py-0.5 text-xs font-medium">
                      <FlameIcon className="h-3 w-3" />
                      {m.streak} day{m.streak === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => openDrawer('adjust', m.id)}>
                      <PlusIcon className="h-3.5 w-3.5 mr-1" /> Adjust
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.balance <= 0}
                      onClick={() => openDrawer('redeem', m.id)}
                    >
                      <GiftIcon className="h-3.5 w-3.5 mr-1" /> Redeem
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* History */}
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Recent activity</h2>
        {summary.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <PiggyBankIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nothing yet — completing a rewarded chore earns pocket money</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.entries.map(e => (
              <Card key={e.id}>
                <CardContent className="py-2.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{e.userName}</span>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                          {TYPE_LABELS[e.type] ?? e.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>
                          {formatInTz(new Date(e.createdAt), timezone, {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                        {e.note && <span className="truncate">· {e.note}</span>}
                        {e.createdByName && <span>· by {e.createdByName}</span>}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold shrink-0 ${
                        e.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {e.amount >= 0 ? '+' : '-'}{money(e.amount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Adjust / Redeem drawer (admin only) */}
      <Drawer open={drawerMode !== null} onOpenChange={(open) => { if (!open) setDrawerMode(null) }}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>
              {drawerMode === 'redeem' ? 'Redeem pocket money' : 'Adjust balance'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label>Family member</Label>
              <Select value={memberId} onValueChange={(v) => setMemberId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a member" />
                </SelectTrigger>
                <SelectContent>
                  {summary.members.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.balance < 0 ? '-' : ''}{money(m.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {drawerMode === 'redeem' && (
              <div className="space-y-1.5">
                <Label>Wishlist item (optional)</Label>
                <Select value={wishlistItemId} onValueChange={(v) => pickWishlistItem(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not from the wishlist" />
                  </SelectTrigger>
                  <SelectContent>
                    {wishlistItems.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.title}{w.estimatedPrice != null ? ` — $${w.estimatedPrice.toFixed(2)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Picking an item marks it purchased on the wishlist.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pm-amount">Amount ($)</Label>
              <Input
                id="pm-amount"
                type="number"
                step="0.50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={drawerMode === 'redeem' ? '5.00' : 'Positive adds, negative deducts'}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pm-note">Note (optional)</Label>
              <textarea
                id="pm-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={drawerMode === 'redeem' ? 'What was it spent on?' : 'Why the adjustment?'}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDrawerMode(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : drawerMode === 'redeem' ? 'Redeem' : 'Save'}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
