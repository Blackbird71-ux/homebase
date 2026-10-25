'use client'

import { LIST_CATEGORY_COLORS } from '@/lib/category-colors'

export function CategoryColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category colour">
      {LIST_CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c}
          aria-label={`Colour ${c}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border-2 transition-all ${
            value.toLowerCase() === c ? 'border-foreground scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}
