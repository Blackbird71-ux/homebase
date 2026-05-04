'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PlayIcon, PauseIcon, RotateCcwIcon, Trash2Icon, PlusIcon, TimerIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Timer {
  id: string
  label: string
  duration: number // total seconds
  remaining: number // remaining seconds
  isRunning: boolean
  isComplete: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TimerDisplay({ timer, onToggle, onReset, onDelete }: {
  timer: Timer
  onToggle: (id: string) => void
  onReset: (id: string) => void
  onDelete: (id: string) => void
}) {
  const progress = timer.duration > 0 ? (timer.remaining / timer.duration) * 100 : 0
  const isWarning = timer.remaining <= 60 && timer.remaining > 0
  const isCritical = timer.remaining <= 30 && timer.remaining > 0

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border p-3 transition-colors',
        timer.isComplete
          ? 'border-green-500/50 bg-green-500/5'
          : isCritical
          ? 'border-red-500/50 bg-red-500/5'
          : isWarning
          ? 'border-amber-500/50 bg-amber-500/5'
          : 'border-border bg-card'
      )}
    >
      {/* Progress bar */}
      <div
        className={cn(
          'absolute bottom-0 left-0 h-1 transition-all duration-1000',
          timer.isComplete ? 'bg-green-500' : isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-primary'
        )}
        style={{ width: `${progress}%` }}
      />

      <div className="flex items-center gap-3 relative z-10">
        <TimerIcon className={cn(
          'h-4 w-4 shrink-0',
          timer.isComplete ? 'text-green-500' : isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-muted-foreground'
        )} />
        
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{timer.label}</p>
          <p className={cn(
            'text-lg font-mono font-bold tabular-nums',
            timer.isComplete ? 'text-green-500' : isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : ''
          )}>
            {timer.isComplete ? 'Done!' : formatTime(timer.remaining)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {timer.isComplete ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onReset(timer.id)}
              className="h-7 w-7"
              title="Restart"
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onToggle(timer.id)}
              className="h-7 w-7"
              title={timer.isRunning ? 'Pause' : 'Start'}
            >
              {timer.isRunning ? (
                <PauseIcon className="h-3.5 w-3.5" />
              ) : (
                <PlayIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(timer.id)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Delete timer"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Parse recipe instruction text for time patterns like:
 *   "Bake for 20 minutes"
 *   "Cook for 5 mins"
 *   "Bake for a further 5 minutes"
 *   "Simmer 30 min"
 *   "Rest 10 minutes"
 *   "Bake 25-30 minutes" (uses the lower bound)
 *
 * Returns an array of { label, minutes } objects.
 */
function parseStepTimers(step: string, stepNumber: number): { label: string; minutes: number }[] {
  const timers: { label: string; minutes: number }[] = []

  // Pattern: "for X minutes" or "for X mins" or "for a further X minutes"
  // Also: "X minutes" without "for" (e.g., "Simmer 30 min")
  // Also: "X-Y minutes" (range, use lower bound)
  const patterns = [
    /for\s+a\s+further\s+(\d+)\s*(?:minutes?|mins?)/gi,
    /for\s+(\d+)\s*(?:minutes?|mins?)/gi,
    /(?:bake|cook|simmer|boil|roast|grill|fry|saute|sauté|rest|chill|refrigerate|freeze|marinate|proof|rise|stand|cool|heat|microwave|steam|broil|toast)\s+(?:for\s+)?(\d+)\s*(?:minutes?|mins?)/gi,
    /(\d+)\s*(?:minutes?|mins?)\s+(?:or\s+until\s|longer\s+or\s+until)/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    pattern.lastIndex = 0
    while ((match = pattern.exec(step)) !== null) {
      const minutes = parseInt(match[1], 10)
      if (!isNaN(minutes) && minutes > 0 && minutes <= 999) {
        // Create a short label from the surrounding context
        const before = step.substring(Math.max(0, match.index - 20), match.index).trim()
        const label = before ? `${before}...` : `Step ${stepNumber}`
        timers.push({ label, minutes })
      }
    }
  }

  return timers
}

export function CookingTimerPanel({ instructions }: { instructions?: string[] }) {
  const [timers, setTimers] = useState<Timer[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const [newSeconds, setNewSeconds] = useState('')
  const [autoCreated, setAutoCreated] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)


  // Play sound when timer completes
  const playAlarm = useCallback(() => {
    try {
      // Use Web Audio API to generate a simple beep
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.value = 0.3
      osc.start()
      setTimeout(() => {
        osc.stop()
        ctx.close()
      }, 500)
    } catch {
      // Audio not available
    }
  }, [])

  // Tick all running timers every second
  useEffect(() => {
    if (timers.some((t) => t.isRunning && !t.isComplete)) {
      intervalRef.current = setInterval(() => {
        setTimers((prev) => {
          let hasNewComplete = false
          const updated = prev.map((t) => {
            if (t.isRunning && !t.isComplete) {
              const newRemaining = t.remaining - 1
              if (newRemaining <= 0) {
                hasNewComplete = true
                return { ...t, remaining: 0, isRunning: false, isComplete: true }
              }
              return { ...t, remaining: newRemaining }
            }
            return t
          })
          if (hasNewComplete) {
            // Play alarm after state update
            setTimeout(playAlarm, 50)
          }
          return updated
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [timers, playAlarm])

  function addTimer() {
    const minutes = parseInt(newMinutes) || 0
    const seconds = parseInt(newSeconds) || 0
    const total = minutes * 60 + seconds
    if (total <= 0) return

    const timer: Timer = {
      id: crypto.randomUUID(),
      label: newLabel.trim() || `Timer ${timers.length + 1}`,
      duration: total,
      remaining: total,
      isRunning: false,
      isComplete: false,
    }
    setTimers((prev) => [...prev, timer])
    setNewLabel('')
    setNewMinutes('')
    setNewSeconds('')
    setShowAddForm(false)
  }

  function toggleTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isRunning: !t.isRunning } : t))
    )
  }

  function resetTimer(id: string) {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, remaining: t.duration, isRunning: false, isComplete: false } : t
      )
    )
  }

  function deleteTimer(id: string) {
    setTimers((prev) => prev.filter((t) => t.id !== id))
  }

  // Auto-create timers from instructions on mount (only once)
  useEffect(() => {
    if (instructions && instructions.length > 0 && !autoCreated) {
      const detected: Timer[] = []
      instructions.forEach((step, i) => {
        const parsed = parseStepTimers(step, i + 1)
        parsed.forEach((p) => {
          detected.push({
            id: crypto.randomUUID(),
            label: p.label,
            duration: p.minutes * 60,
            remaining: p.minutes * 60,
            isRunning: false,
            isComplete: false,
          })
        })
      })
      if (detected.length > 0) {
        setTimers(detected)
        setAutoCreated(true)
      }
    }
  }, [instructions, autoCreated])

  function createStepTimers() {
    if (!instructions) return
    const detected: Timer[] = []
    instructions.forEach((step, i) => {
      const parsed = parseStepTimers(step, i + 1)
      parsed.forEach((p) => {
        // Avoid duplicates — check if a timer with same label and duration already exists
        const exists = timers.some(
          (t) => t.label === p.label && t.duration === p.minutes * 60
        )
        if (!exists) {
          detected.push({
            id: crypto.randomUUID(),
            label: p.label,
            duration: p.minutes * 60,
            remaining: p.minutes * 60,
            isRunning: false,
            isComplete: false,
          })
        }
      })
    })
    if (detected.length > 0) {
      setTimers((prev) => [...prev, ...detected])
      setAutoCreated(true)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <TimerIcon className="h-4 w-4" />
          Timers
        </h3>
        <div className="flex items-center gap-1">
          {instructions && instructions.length > 0 && !showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={createStepTimers}
              className="h-7 text-xs"
              title="Auto-detect timers from recipe steps"
            >
              <TimerIcon className="h-3 w-3 mr-1" />
              Step Timers
            </Button>
          )}
          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="h-7 text-xs"
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              Add Timer
            </Button>
          )}
        </div>
      </div>


      {showAddForm && (
        <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Timer label (optional)"
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              max="999"
              value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)}
              placeholder="Min"
              className="h-8 text-sm w-20"
            />
            <Input
              type="number"
              min="0"
              max="59"
              value={newSeconds}
              onChange={(e) => setNewSeconds(e.target.value)}
              placeholder="Sec"
              className="h-8 text-sm w-20"
            />
            <Button
              size="sm"
              onClick={addTimer}
              disabled={!newMinutes && !newSeconds}
              className="h-8"
            >
              Start
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
              className="h-8"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {timers.length > 0 && (
        <div className="space-y-1.5">
          {timers.map((timer) => (
            <TimerDisplay
              key={timer.id}
              timer={timer}
              onToggle={toggleTimer}
              onReset={resetTimer}
              onDelete={deleteTimer}
            />
          ))}
        </div>
      )}

      {timers.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Add timers for recipe steps (e.g., "Boil pasta 8 min")
        </p>
      )}
    </div>
  )
}
