'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Bot, Eye, EyeOff } from 'lucide-react'

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', description: 'Free tier available via Google AI Studio' },
  { id: 'deepseek', label: 'DeepSeek', description: 'Very cost-effective, strong reasoning' },
]

const MODELS_BY_PROVIDER: Record<string, Array<{ id: string; label: string }>> = {
  gemini: [
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — lightest, lowest cost' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — recommended' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — more capable' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — most capable' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  ],
}

const KEY_HELP: Record<string, { placeholder: string; linkText: string; linkHref: string }> = {
  gemini: {
    placeholder: 'AIza...',
    linkText: 'aistudio.google.com → Get API key',
    linkHref: 'https://aistudio.google.com',
  },
  deepseek: {
    placeholder: 'sk-...',
    linkText: 'platform.deepseek.com → API Keys',
    linkHref: 'https://platform.deepseek.com/api_keys',
  },
}

const DEFAULT_MODEL: Record<string, string> = {
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
}

type Status = { type: 'success' | 'error'; message: string } | null

export function AISettingsTab() {
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [aiProvider, setAiProvider] = useState('gemini')
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
        setMaskedKey(data.aiApiKey)
        setAiProvider(data.aiProvider ?? 'gemini')
        setAiModel(data.aiModel ?? 'gemini-2.0-flash')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleProviderChange(newProvider: string) {
    setAiProvider(newProvider)
    setAiModel(DEFAULT_MODEL[newProvider] ?? 'gemini-2.0-flash')
    setStatus(null)
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const body: Record<string, string> = { aiProvider, aiModel }
      if (apiKey.trim()) body.aiApiKey = apiKey.trim()
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
        const data = await res.json().catch(() => null)
        setStatus({ type: 'error', message: data?.error ?? 'Failed to save.' })
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
        body: JSON.stringify({ aiApiKey: '' }),
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

  const models = MODELS_BY_PROVIDER[aiProvider] ?? MODELS_BY_PROVIDER.gemini
  const keyHelp = KEY_HELP[aiProvider] ?? KEY_HELP.gemini

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant
          </CardTitle>
          <CardDescription>
            Configure an AI provider and API key to enable the assistant. You can then use voice or text to add recipes to the meal plan, create notes, add shopping items, and more.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider selection */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider">Provider</Label>
            <Select value={aiProvider} onValueChange={v => { if (v) handleProviderChange(v) }}>
              <SelectTrigger id="ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label} — {p.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API key */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">API Key</Label>
            {hasKey && (
              <p className="text-xs text-muted-foreground">
                Key saved: <span className="font-mono">{maskedKey}</span>
              </p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="ai-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setStatus(null) }}
                  placeholder={hasKey ? 'Enter a new key to replace the existing one' : keyHelp.placeholder}
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
              Get a key at{' '}
              <span className="font-medium">{keyHelp.linkText}</span>
            </p>
          </div>

          {/* Model selection */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <Select value={aiModel} onValueChange={v => { if (v) { setAiModel(v); setStatus(null) } }}>
              <SelectTrigger id="ai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button type="button" onClick={save} disabled={saving || (!apiKey.trim() && !hasKey)}>
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
                <li>Generate shopping list — <em>"Add this week's meal ingredients to the shopping list"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Shopping &amp; to-do lists</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Add items — <em>"Add milk, eggs, and bread"</em></li>
                <li>Read the list — <em>"What's on the shopping list?"</em></li>
                <li>Tick off an item — <em>"Mark milk as bought"</em></li>
                <li>Add a task — <em>"Add 'call the plumber' to my to-do list"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Calendar</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Create an event — <em>"Add dentist on Thursday at 2pm"</em></li>
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
              <p className="font-medium text-foreground mb-1">Notes</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Create — <em>"Create a note called Weekly Goals and dictate it"</em></li>
                <li>Search — <em>"Do I have any notes about the car?"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Recipes</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Search — <em>"Do we have a recipe for chicken curry?"</em></li>
                <li>Ingredients — <em>"What do I need for pasta bake?"</em></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Contacts, documents &amp; birthdays</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Look up a contact — <em>"What's the dentist's number?"</em></li>
                <li>Check documents — <em>"Any documents expiring soon?"</em></li>
                <li>Birthdays — <em>"Any birthdays coming up this month?"</em></li>
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
