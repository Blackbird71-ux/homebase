'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CameraIcon, BarcodeIcon, XIcon } from 'lucide-react'

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<any>(null)

  // Check if BarcodeDetector is supported
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      setSupported(true)
      try {
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        })
      } catch {
        detectorRef.current = null
      }
    } else {
      setSupported(false)
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScanning(true)
      scanLoop()
    } catch (err) {
      setError('Could not access camera. Please check permissions or enter the barcode manually.')
    }
  }, [])

  const scanLoop = useCallback(() => {
    if (!detectorRef.current || !videoRef.current || !scanning) return

    detectorRef.current
      .detect(videoRef.current)
      .then((barcodes: Array<{ rawValue: string }>) => {
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue
          stopCamera()
          onDetected(code)
        }
      })
      .catch(() => {
        // Detection error — try again
      })

    // Continue scanning every 500ms
    if (scanning) {
      setTimeout(scanLoop, 500)
    }
  }, [scanning, onDetected])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (manualCode.trim()) {
      onDetected(manualCode.trim())
    }
  }

  function handleClose() {
    stopCamera()
    onClose()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <BarcodeIcon className="h-4 w-4" />
          Scan Barcode
        </h3>
        <Button variant="ghost" size="icon-xs" onClick={handleClose} className="h-6 w-6">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Camera view */}
      {supported !== false && (
        <div className="relative">
          {scanning ? (
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="w-full h-48 object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-1/3 border-2 border-white/50 rounded-lg" />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={stopCamera}
                className="absolute top-2 right-2"
              >
                <XIcon className="h-3 w-3 mr-1" />
                Stop
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={startCamera}
              className="w-full h-24 flex flex-col items-center justify-center gap-1"
            >
              <CameraIcon className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Tap to scan barcode</span>
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {supported === false && (
        <p className="text-xs text-muted-foreground">
          Barcode scanning is not supported in this browser. Enter the code manually below.
        </p>
      )}

      {/* Manual entry fallback */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Enter barcode number..."
          className="h-8 text-sm flex-1"
        />
        <Button type="submit" size="sm" className="h-8" disabled={!manualCode.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}
