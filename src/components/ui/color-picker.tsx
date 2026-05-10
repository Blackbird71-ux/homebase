// src/components/ui/color-picker.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { Palette } from 'lucide-react'

export const DEFAULT_PRESET_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308',
  '#22C55E', '#14B8A6', '#3B82F6', '#F43F5E', '#A855F7',
  '#64748B', '#0EA5E9', '#D97706', '#16A34A', '#DC2626',
]

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  /** Array of hex colour presets shown as clickable swatches. Defaults to DEFAULT_PRESET_COLORS. */
  presetColors?: string[]
  /** Whether to show the preset colour swatch row. Defaults to true. */
  showPresets?: boolean
}

export function ColorPicker({
  value,
  onChange,
  className,
  disabled,
  presetColors = DEFAULT_PRESET_COLORS,
  showPresets = true,
}: ColorPickerProps) {
  const [color, setColor] = useState(value || '#3b82f6')
  const colorInputRef = useRef<HTMLInputElement>(null)
  const nativeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value !== color) {
      setColor(value)
    }
  }, [value])

  const handleColorChange = (newColor: string) => {
    setColor(newColor)
    onChange(newColor)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setColor(newColor)
    onChange(newColor)
  }

  const handleColorPickerClick = () => {
    if (colorInputRef.current) {
      colorInputRef.current.click()
    }
  }

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setColor(newColor)
    onChange(newColor)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showPresets && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {presetColors.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => handleColorChange(c)}
              disabled={disabled}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                color === c
                  ? 'border-foreground scale-110 ring-1 ring-foreground/30'
                  : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
              title={c}
              aria-label={`Select colour ${c}`}
            />
          ))}
          <button
            type="button"
            onClick={() => nativeInputRef.current?.click()}
            disabled={disabled}
            className="w-6 h-6 rounded-full border border-input bg-background flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
            title="Custom colour"
            aria-label="Pick a custom colour"
          >
            <Palette className="h-3 w-3 text-muted-foreground" />
          </button>
          <input
            ref={nativeInputRef}
            type="color"
            value={color}
            onChange={handleNativeColorChange}
            className="sr-only"
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div
          className="w-10 h-10 rounded border-2 border-border shrink-0"
          style={{ backgroundColor: color }}
        />
        <Input
          type="text"
          value={color}
          onChange={handleInputChange}
          placeholder="#RRGGBB"
          className="w-32"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleColorPickerClick}
          className="p-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          disabled={disabled}
          aria-label="Open color picker"
        >
          <Palette className="h-4 w-4" />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={color}
          onChange={handleNativeColorChange}
          className="sr-only"
          aria-hidden="true"
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Click a swatch above, enter a hex code, or use the colour picker
      </div>
    </div>
  )
}
