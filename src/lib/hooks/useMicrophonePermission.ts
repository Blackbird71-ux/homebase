'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ---------- types ----------

export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'loading'

export type Platform = 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'unknown'

export interface MicrophonePermissionResult {
  /** Current permission state */
  permissionState: PermissionState
  /** Detected platform */
  platform: Platform
  /** Whether the browser supports getUserMedia at all */
  isSupported: boolean
  /** Request microphone access — returns true if granted */
  requestPermission: () => Promise<boolean>
  /** Reset the stored "don't ask again" preference */
  resetDismissed: () => void
  /** Whether the user has previously dismissed the prompt */
  isDismissed: boolean
  /** Dismiss the prompt (stores in localStorage) */
  dismiss: () => void
}

// ---------- helpers ----------

const STORAGE_KEY = 'homebase-mic-permission-dismissed'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown'

  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) {
    // Check if it's iOS (iPadOS reports like macOS in some cases)
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
    return 'macos'
  }
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function isDismissedFromStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// ---------- hook ----------

export function useMicrophonePermission(): MicrophonePermissionResult {
  const [permissionState, setPermissionState] = useState<PermissionState>('loading')
  const [isDismissed, setIsDismissed] = useState(false)
  const platform = detectPlatform()
  const isSupported = typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  const hasCheckedRef = useRef(false)

  // Check initial permission state on mount
  useEffect(() => {
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    setIsDismissed(isDismissedFromStorage())

    if (!isSupported) {
      setPermissionState('unavailable')
      return
    }

    // Try to check permission via Permissions API (not supported everywhere)
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setPermissionState(result.state as PermissionState)
          // Listen for changes
          result.addEventListener('change', () => {
            setPermissionState(result.state as PermissionState)
          })
        })
        .catch(() => {
          // Permissions API doesn't support 'microphone' in all browsers
          // Fall back to 'prompt' — we'll check on first request
          setPermissionState('prompt')
        })
    } else {
      setPermissionState('prompt')
    }
  }, [isSupported])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setPermissionState('unavailable')
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Stop all tracks immediately — we just wanted the permission
      stream.getTracks().forEach(track => track.stop())
      setPermissionState('granted')
      return true
    } catch (err) {
      const error = err as DOMException
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionState('denied')
      } else if (error.name === 'NotFoundError') {
        setPermissionState('unavailable')
      } else {
        setPermissionState('denied')
      }
      return false
    }
  }, [isSupported])

  const dismiss = useCallback(() => {
    setIsDismissed(true)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // localStorage may be unavailable
    }
  }, [])

  const resetDismissed = useCallback(() => {
    setIsDismissed(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage may be unavailable
    }
  }, [])

  return {
    permissionState,
    platform,
    isSupported,
    requestPermission,
    resetDismissed,
    isDismissed,
    dismiss,
  }
}
