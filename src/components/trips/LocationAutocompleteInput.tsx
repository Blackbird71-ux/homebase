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
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Sync external value into the uncontrolled input (e.g. after form reset)
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value
    }
  }, [value])

  useEffect(() => {
    if (!placesLib || !inputRef.current) return

    // Use the classic Autocomplete class — it appends .pac-container to document.body,
    // which avoids being clipped by the drawer's overflow-y: auto.
    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ['name', 'formatted_address', 'geometry'],
    })

    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const name = place.name ?? place.formatted_address ?? ''
      const lat = place.geometry?.location?.lat()
      const lng = place.geometry?.location?.lng()
      if (inputRef.current) inputRef.current.value = name
      onChangeRef.current(name, lat, lng)
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [placesLib])

  return (
    <div className="hb-input-with-icon">
      <MapPin size={14} aria-hidden />
      <input
        ref={inputRef}
        defaultValue={value}
        onChange={(e) => onChangeRef.current(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="hb-input"
      />
    </div>
  )
}
