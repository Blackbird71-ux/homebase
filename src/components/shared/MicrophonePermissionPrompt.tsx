'use client'

import { useState } from 'react'
import { Mic, ShieldAlert, ShieldCheck, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMicrophonePermission, type Platform } from '@/lib/hooks/useMicrophonePermission'

// ---------- platform-specific messaging ----------

interface PlatformInfo {
  icon: string
  title: string
  description: string
  instructions: string
  /** Extra note shown when permission was previously denied */
  deniedHelp: string
}

const platformMessages: Record<Platform, PlatformInfo> = {
  windows: {
    icon: '🪟',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Click "Allow" when your browser shows the microphone permission prompt at the top of the window.',
    deniedHelp:
      'Microphone access was denied. To enable it:\n1. Click the lock/info icon in your browser\'s address bar\n2. Find "Microphone" in the permissions list\n3. Change it to "Allow"\n4. Reload the page',
  },
  macos: {
    icon: '🍎',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Click "Allow" when your browser shows the microphone permission prompt.',
    deniedHelp:
      'Microphone access was denied. To enable it:\n1. Open System Settings > Privacy & Security > Microphone\n2. Enable microphone access for your browser (Chrome, Safari, etc.)\n3. Reload this page',
  },
  ios: {
    icon: '📱',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Tap "Allow" when Safari asks for microphone permission.',
    deniedHelp:
      'Microphone access was denied. To enable it:\n1. Open Settings > Safari > Microphone\n2. Ensure microphone access is enabled\n3. Or go to Settings > Privacy > Microphone\n4. Enable Safari\n5. Reload this page',
  },
  android: {
    icon: '🤖',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Tap "Allow" when Chrome asks for microphone permission.',
    deniedHelp:
      'Microphone access was denied. To enable it:\n1. Tap the lock icon in Chrome\'s address bar\n2. Tap "Permissions" > "Microphone"\n3. Select "Allow"\n4. Reload this page',
  },
  linux: {
    icon: '🐧',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Click "Allow" when your browser shows the microphone permission prompt.',
    deniedHelp:
      'Microphone access was denied. Check your browser\'s site permissions and system audio settings.',
  },
  unknown: {
    icon: '🎤',
    title: 'Microphone Access Required',
    description:
      'Homebase needs access to your microphone for voice commands and AI assistant features.',
    instructions:
      'Click "Allow" when your browser shows the microphone permission prompt.',
    deniedHelp:
      'Microphone access was denied. Please check your browser and system privacy settings to enable microphone access.',
  },
}

// ---------- component ----------

interface MicrophonePermissionPromptProps {
  /** Optional trigger — if not provided, the prompt shows automatically when needed */
  trigger?: React.ReactNode
  /** Called when permission is successfully granted */
  onPermissionGranted?: () => void
  /** Called when the prompt is dismissed */
  onDismiss?: () => void
}

export function MicrophonePermissionPrompt({
  trigger,
  onPermissionGranted,
  onDismiss,
}: MicrophonePermissionPromptProps) {
  const {
    permissionState,
    platform,
    isSupported,
    requestPermission,
    isDismissed,
    dismiss,
  } = useMicrophonePermission()

  const [open, setOpen] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [showDeniedHelp, setShowDeniedHelp] = useState(false)

  const info = platformMessages[platform]

  // Determine if the prompt should show
  const shouldShow =
    isSupported &&
    !isDismissed &&
    (permissionState === 'prompt' || permissionState === 'denied')

  // ---------- handlers ----------

  async function handleGrant() {
    setIsRequesting(true)
    const granted = await requestPermission()
    setIsRequesting(false)

    if (granted) {
      setOpen(false)
      onPermissionGranted?.()
    } else {
      setShowDeniedHelp(true)
    }
  }

  function handleDismiss() {
    setOpen(false)
    dismiss()
    onDismiss?.()
  }

  function handleLater() {
    setOpen(false)
    onDismiss?.()
  }

  // ---------- render ----------

  // If not in a state that needs prompting, don't render anything
  if (permissionState === 'loading' || permissionState === 'granted' || permissionState === 'unavailable') {
    return null
  }

  // If dismissed, don't show unless there's a trigger button
  if (isDismissed && !trigger) return null

  return (
    <>
      {/* Trigger button (if provided) */}
      {trigger && (
        <div onClick={() => setOpen(true)}>
          {trigger}
        </div>
      )}

      {/* Auto-show dialog when permission is needed */}
      <Dialog open={open || shouldShow} onOpenChange={(isOpen) => {
        if (!isOpen) handleDismiss()
        else setOpen(true)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {showDeniedHelp ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : (
                <Mic className="h-5 w-5 text-primary" />
              )}
              <DialogTitle>
                {showDeniedHelp ? 'Microphone Access Denied' : info.title}
              </DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              {showDeniedHelp ? (
                <span className="text-destructive">
                  We couldn't access your microphone. Follow the steps below to enable it.
                </span>
              ) : (
                info.description
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Platform-specific instructions */}
          <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-base">{info.icon}</span>
              <span>
                {platform === 'windows' && 'Windows'}
                {platform === 'macos' && 'macOS'}
                {platform === 'ios' && 'iOS (iPhone/iPad)'}
                {platform === 'android' && 'Android'}
                {platform === 'linux' && 'Linux'}
                {platform === 'unknown' && 'Your Device'}
              </span>
            </div>
            <p className="text-muted-foreground whitespace-pre-line">
              {showDeniedHelp ? info.deniedHelp : info.instructions}
            </p>
          </div>

          {/* Permission status indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {permissionState === 'denied' ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                <span className="text-destructive">Permission was denied</span>
              </>
            ) : permissionState === 'prompt' ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                <span>Permission not yet granted</span>
              </>
            ) : null}
          </div>

          <DialogFooter>
            {showDeniedHelp ? (
              <>
                <Button variant="outline" onClick={handleDismiss}>
                  <X className="h-4 w-4" />
                  Dismiss
                </Button>
                <Button onClick={() => setShowDeniedHelp(false)}>
                  <Mic className="h-4 w-4" />
                  Try Again
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleLater}>
                  Not Now
                </Button>
                <Button onClick={handleGrant} disabled={isRequesting}>
                  {isRequesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  {isRequesting ? 'Requesting...' : 'Grant Access'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
