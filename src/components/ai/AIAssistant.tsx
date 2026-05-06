'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Send, X, Bot, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
}

// ---------- types ----------

type Message = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
}

type RecordingState = 'idle' | 'listening' | 'processing'

function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [hasVoiceSupport, setHasVoiceSupport] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHasVoiceSupport(!!getSpeechRecognition())
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendCommand = useCallback(async (text: string) => {
    if (!text.trim()) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setRecordingState('processing')

    try {
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'error',
          text: data.error ?? 'Something went wrong.',
        }])
      } else {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: data.message ?? 'Done.',
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'error',
        text: 'Network error — check your connection.',
      }])
    } finally {
      setRecordingState('idle')
    }
  }, [])

  function startListening() {
    const SR = getSpeechRecognition()
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-AU'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.resultIndex][0].transcript
      sendCommand(transcript)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted') {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'error',
          text: `Microphone error: ${event.error}. Try typing instead.`,
        }])
      }
      setRecordingState('idle')
    }

    recognition.onend = () => {
      if (recordingState === 'listening') {
        setRecordingState('idle')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setRecordingState('listening')
  }

  function stopListening() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setRecordingState('idle')
  }

  function toggleMic() {
    if (recordingState === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendCommand(inputText)
    }
  }

  const isProcessing = recordingState === 'processing'

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-36 right-4 md:bottom-6 md:right-6 z-40 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all
          ${open ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-accent'}
          ${recordingState === 'listening' ? 'ring-2 ring-red-500 ring-offset-2' : ''}
        `}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        <Bot className="h-5 w-5" />
        {recordingState === 'listening' && (
          <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-30" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-52 right-4 md:bottom-20 md:right-6 z-50 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(480px, calc(100dvh - 180px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground space-y-1">
                <p className="font-medium">What can I help with?</p>
                <p className="text-xs">"Add pasta to Monday lunch"</p>
                <p className="text-xs">"Create a note called Weekly Goals"</p>
                <p className="text-xs">"Add milk and eggs to the shopping list"</p>
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : msg.role === 'error'
                    ? 'bg-destructive/10 text-destructive flex items-start gap-1.5'
                    : 'bg-muted text-foreground'
                }`}
              >
                {msg.role === 'error' && <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                {msg.text}
              </div>
            ))}
            {isProcessing && (
              <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2 max-w-[90%]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="border-t border-border p-2 flex gap-1.5">
            {hasVoiceSupport && (
              <Button
                type="button"
                variant={recordingState === 'listening' ? 'destructive' : 'outline'}
                size="icon"
                className={`shrink-0 ${recordingState === 'listening' ? 'animate-pulse' : ''}`}
                onClick={toggleMic}
                disabled={isProcessing}
                aria-label={recordingState === 'listening' ? 'Stop recording' : 'Start voice input'}
              >
                {recordingState === 'listening' ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Input
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={recordingState === 'listening' ? 'Listening...' : 'Type a command...'}
              disabled={isProcessing || recordingState === 'listening'}
              className="flex-1 text-sm"
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              onClick={() => sendCommand(inputText)}
              disabled={!inputText.trim() || isProcessing}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
