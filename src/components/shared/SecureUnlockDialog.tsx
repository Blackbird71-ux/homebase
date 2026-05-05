'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SecureUnlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: 'note' | 'document' | 'contact'
  entityId: string
  entityName: string
  onUnlocked: () => void
}

export function SecureUnlockDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  onUnlocked,
}: SecureUnlockDialogProps) {
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  const entityLabel = entityType === 'note' ? 'Note' : entityType === 'document' ? 'Document' : 'Contact'

  async function handleUnlock() {
    if (!pin || pin.length < 4) {
      setError('PIN must be at least 4 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/${entityType}s/${entityId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        const data = await res.json()
        setAttempts((a) => a + 1)
        if (res.status === 403) {
          setError('Incorrect PIN. Please try again.')
        } else {
          setError(data.error ?? 'Failed to unlock')
        }
        return
      }

      onUnlocked()
      onOpenChange(false)
      setPin('')
      setAttempts(0)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !loading) {
      handleUnlock()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Secure {entityLabel}</DialogTitle>
              <DialogDescription>
                This {entityLabel.toLowerCase()} is protected by a PIN.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Enter the PIN to view <span className="font-medium text-foreground">{entityName}</span>
          </div>

          <div className="relative">
            <Input
              type={showPin ? 'text' : 'password'}
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              maxLength={20}
              autoFocus
              className="pr-10 text-lg tracking-widest text-center"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {attempts >= 3 && (
            <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Multiple failed attempts. Please remember your PIN.</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                setPin('')
                setError(null)
                setAttempts(0)
              }}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnlock}
              disabled={loading || pin.length < 4}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Unlock
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
