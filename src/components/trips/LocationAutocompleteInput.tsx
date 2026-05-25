'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'

interface LocationAutocompleteInputProps {
  value: string
  onChange: (value: string, lat?: number, lng?: number) => void
  disabled?: boolean
  placeholder?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ACSuggestion = any

export function LocationAutocompleteInput({
  value,
  onChange,
  disabled,
  placeholder = 'e.g. Eiffel Tower',
}: LocationAutocompleteInputProps) {
  const placesLib = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<ACSuggestion[]>([])
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const sessionTokenRef = useRef<unknown>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  function newToken() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionTokenRef.current = new (google.maps.places as any).AutocompleteSessionToken()
  }

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!placesLib || input.length < 2) { setSuggestions([]); return }
    if (!sessionTokenRef.current) newToken()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { suggestions } = await (google.maps.places as any).AutocompleteSuggestion
        .fetchAutocompleteSuggestions({ input, sessionToken: sessionTokenRef.current })
      setSuggestions(suggestions ?? [])
      if ((suggestions ?? []).length > 0 && inputRef.current) {
        setDropdownRect(inputRef.current.getBoundingClientRect())
      } else {
        setDropdownRect(null)
      }
    } catch {
      setSuggestions([])
      setDropdownRect(null)
    }
  }, [placesLib])

  async function selectSuggestion(s: ACSuggestion) {
    const place = s.placePrediction?.toPlace()
    if (!place) return
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
    const name: string = place.displayName ?? place.formattedAddress ?? ''
    const lat: number | undefined = place.location?.lat()
    const lng: number | undefined = place.location?.lng()
    setSuggestions([])
    setDropdownRect(null)
    newToken() // new token after each selection for billing
    onChangeRef.current(name, lat, lng)
  }

  function closeDropdown() {
    // Delay so onMouseDown on a suggestion fires before blur hides it
    setTimeout(() => { setSuggestions([]); setDropdownRect(null) }, 150)
  }

  const dropdown = suggestions.length > 0 && dropdownRect && typeof document !== 'undefined'
    ? createPortal(
        <ul
          style={{
            position: 'fixed',
            top: dropdownRect.bottom + 2,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((s: ACSuggestion, i: number) => (
            <li
              key={i}
              onMouseDown={() => selectSuggestion(s)}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : undefined,
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--background)')}
            >
              {s.placePrediction?.text?.toString() ?? ''}
            </li>
          ))}
        </ul>,
        document.body
      )
    : null

  return (
    <div className="hb-input-with-icon">
      <MapPin size={14} aria-hidden />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChangeRef.current(e.target.value)
          fetchSuggestions(e.target.value)
        }}
        onFocus={() => { if (!sessionTokenRef.current) newToken() }}
        onBlur={closeDropdown}
        disabled={disabled}
        placeholder={placeholder}
        className="hb-input"
        autoComplete="off"
      />
      {dropdown}
    </div>
  )
}
