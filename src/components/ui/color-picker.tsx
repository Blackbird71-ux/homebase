// src/components/ui/color-picker.tsx
'use client'

import { useState, useEffect } from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

const PRESET_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
  '#64748b', // slate-500
  '#000000', // black
  '#ffffff', // white
]

export function ColorPicker({ value, onChange, className, disabled }: ColorPickerProps) {
  const [color, setColor] = useState(value || '#3b82f6')

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
      </div>
      <div className="grid grid-cols-5 gap-1">
        {PRESET_COLORS.map((presetColor) => (
          <button
            key={presetColor}
            type="button"
            className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: presetColor }}
            onClick={() => handleColorChange(presetColor)}
            aria-label={`Select color ${presetColor}`}
            disabled={disabled}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Enter hex color code (e.g., #3b82f6) or click a preset
      </div>
    </div>
  )
}