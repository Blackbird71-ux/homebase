// src/components/ui/color-picker.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { Palette } from 'lucide-react'

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

export function ColorPicker({ value, onChange, className, disabled }: ColorPickerProps) {
  const [color, setColor] = useState(value || '#3b82f6')
  const colorInputRef = useRef<HTMLInputElement>(null)

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
      <div className="flex items-center gap-2">
        <div
          className="w-10 h-10 rounded border-2 border-border"
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
        Enter hex color code (e.g., #3b82f6) or use the color picker
      </div>
    </div>
  )
}