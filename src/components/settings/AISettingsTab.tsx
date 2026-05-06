'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Bot, Eye, EyeOff } from 'lucide-react'

const MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Recommended — fast and cost-effective' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'More capable, higher cost' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Most capable, highest cost' },
]

type Status = { type: 'success' | 'error'; message: string } | null

export function AISettingsTab() {
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [aiModel, setAiModel] = useState('gemini-2.0-flash')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/ai')
      .then(r => r.json())
      .then(data => {
        setHasKey(data.hasKey)
        setMaskedKey(data.geminiApiKey)
        setAiModel(data.aiModel ?? 'gemini-2.0-flash')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const body: Record<string, string> = { aiModel }
      if (apiKey.trim()) body.geminiApiKey = apiKey.trim()
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        if (apiKey.trim()) {
          setHasKey(true)
          setMaskedKey(`...${apiKey.trim().slice(-4)}`)
          setApiKey('')
        }
        setStatus({ type: 'success', message: 'AI settings saved.' })
      } else {
        const data = await res.json()
        setStatus({ type: 'error', message: data.error ?? 'Failed to save.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Say "Connection successful" and nothing else.' }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ type: 'success', message: `Connection successful! Response: ${data.message}` })
      } else {
        setStatus({ type: 'error', message: data.error ?? 'Test failed.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setTesting(false)
    }
  }

  async function clearKey() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: '' }),
      })
      if (res.ok) {
        setHasKey(false)
        setMaskedKey(null)
        setApiKey('')
        setStatus({ type: 'success', message: 'API key removed.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant
          </CardTitle>
          <CardDescription>
            Configure a Gemini API key to enable the AI assistant. You can then use voice or text to add recipes to the meal plan, create notes, add shopping items, and more.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* API key */}
          <div className="space-y-1.5">
            <Label htmlFor="gemini-key">Gemini API Key</Label>
            {hasKey && (
              <p className="text-xs text-muted-foreground">
                Key saved: <span className="font-mono">{maskedKey}</span>
              </p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="gemini-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setStatus(null) }}
                  placeholder={hasKey ? 'Enter a new key to replace the existing one' : 'AIza...'}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(v => !v)}
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {hasKey && (
                <Button type="button" variant="outline" onClick={clearKey} disabled={saving}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get a free key at{' '}
              <span className="font-medium">aistudio.google.com</span> → Get API key.
            </p>
          </div>

          {/* Model selection */}
          <div className="space-y-2">
            <Label>Model</Label>
            <div className="grid gap-2">
              {MODELS.map(m => (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${aiModel === m.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}`}
                >
                  <input
                    type="radio"
                    name="ai-model"
                    value={m.id}
                    checked={aiModel === m.id}
                    onChange={() => { setAiModel(m.id); setStatus(null) }}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button type="button" onClick={save} disabled={saving || (!apiKey.trim() && aiModel === (maskedKey ? aiModel : 'gemini-2.0-flash'))}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {hasKey && (
              <Button type="button" variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            )}
          </div>

          {status && (
            <div role="alert" className={`flex items-start gap-2 text-sm p-3 rounded-md ${status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {status.type === 'success'
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="whitespace-pre-wrap">{status.message}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What can the AI assistant do?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Meal plan</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Add a recipe — <em>"Add pasta bake to Monday lunch"</em></li>
                <li>Remove a meal — <em>"Clear Tuesday dinner"</em></li>
                <li>Check the plan — <em>"What's for dinner this week?"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Shopping &amp; to-do lists</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Add items — <em>"Add milk, eggs, and bread"</em></li>
                <li>Read the list — <em>"What's on the shopping list?"</em></li>
                <li>Add a task — <em>"Add 'call the plumber' to my to-do list"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Calendar</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Create an event — <em>"Add dentist appointment on Thursday at 2pm"</em></li>
                <li>Check events — <em>"What's on this week?"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Chores</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Mark done — <em>"I just did the vacuuming"</em></li>
                <li>Check due — <em>"What chores are overdue?"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Notes &amp; recipes</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Create a note — <em>"Create a note called Weekly Goals and dictate it"</em></li>
                <li>Search recipes — <em>"Do we have a recipe for chicken curry?"</em></li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Click the Bot button (bottom-right corner of any page) to open the assistant. Voice and text input are both supported.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
