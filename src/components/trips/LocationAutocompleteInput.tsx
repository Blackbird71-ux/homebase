'use client'

import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'

interface LocationAutocompleteInputProps {
  value: string
  onChange: (value: string, lat?: number, lng?: number) => void
  disabled?: boolean
  placeholder?: string
}

export function LocationAutocompleteInput({
  value,
  onChange,
  disabled,
  placeholder = 'e.g. Eiffel Tower',
}: LocationAutocompleteInputProps) {
  const placesLib = useMapsLibrary('places')
  const containerRef = useRef<HTMLDivElement>(null)
  const pacRef = useRef<HTMLElement | null>(null)

  // Use refs for callback and value to avoid stale closures in event handlers
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Sync external value into the PAC element (e.g. after a form reset)
  useEffect(() => {
    valueRef.current = value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pacRef.current && (pacRef.current as any).value !== value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(pacRef.current as any).value = value
    }
  }, [value])

  useEffect(() => {
    if (!placesLib || !containerRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PAE = (google.maps.places as any).PlaceAutocompleteElement
    if (!PAE) return

    const pac: HTMLElement = new PAE()
    pac.setAttribute('placeholder', placeholder)

    // Strip Material Design chrome so our wrapper provides all visual styling
    pac.style.cssText = [
      'width:100%',
      '--gmp-mat-color-surface:transparent',
      '--gmp-mat-color-outline:transparent',
      '--gmp-mat-color-on-surface:inherit',
      '--gmp-mat-color-on-surface-variant:inherit',
      '--gmp-mat-shape-medium:0',
      'box-shadow:none',
      'font-size:0.875rem',
      'line-height:1.5',
    ].join(';')

    // Seed with current value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (valueRef.current) (pac as any).value = valueRef.current

    async function onSelect(event: Event) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const place = (event as any).place
      if (!place) return
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name: string = (place as any).displayName ?? (place as any).formattedAddress ?? ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc: google.maps.LatLng | null = (place as any).location ?? null
      valueRef.current = name
      onChangeRef.current(name, loc?.lat(), loc?.lng())
    }

    function onInput() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = ((pac as any).value ?? '') as string
      valueRef.current = text
      onChangeRef.current(text)
    }

    pac.addEventListener('gmp-placeselect', onSelect)
    pac.addEventListener('input', onInput)
    pacRef.current = pac
    containerRef.current.appendChild(pac)

    return () => {
      pac.removeEventListener('gmp-placeselect', onSelect)
      pac.removeEventListener('input', onInput)
      try { containerRef.current?.removeChild(pac) } catch {}
      pacRef.current = null
    }
  }, [placesLib, placeholder])

  // Fallback: plain text input when Places API isn't loaded or saving is in progress
  if (!placesLib || disabled) {
    return (
      <div className="hb-input-with-icon">
        <MapPin size={14} aria-hidden />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="hb-input"
        />
      </div>
    )
  }

  return (
    <div className="hb-location-pac-wrapper">
      <MapPin size={14} aria-hidden />
      <div ref={containerRef} className="hb-location-pac-input" />
    </div>
  )
}
