'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface NutritionPanelProps {
  calories: string | null
  fatContent: string | null
  proteinContent: string | null
  carbContent: string | null
  sodiumContent: string | null
  servings: number | null
}

const NUTRIENTS = [
  { key: 'calories' as const, label: 'Calories', icon: '🔥' },
  { key: 'fatContent' as const, label: 'Fat', icon: '🧈' },
  { key: 'proteinContent' as const, label: 'Protein', icon: '🥩' },
  { key: 'carbContent' as const, label: 'Carbs', icon: '🌾' },
  { key: 'sodiumContent' as const, label: 'Sodium', icon: '🧂' },
] as const

export function NutritionPanel({ calories, fatContent, proteinContent, carbContent, sodiumContent, servings }: NutritionPanelProps) {
  const values = { calories, fatContent, proteinContent, carbContent, sodiumContent }
  const hasAny = NUTRIENTS.some(({ key }) => values[key] != null && values[key] !== '')

  if (!hasAny) return null

  return (
    <section className="pt-4 border-t">
      <h2 className="text-lg font-semibold mb-3">Nutrition</h2>
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          {servings != null && (
            <p className="text-xs text-muted-foreground mb-3">Per serving</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {NUTRIENTS.map(({ key, label, icon }) => {
              const value = values[key]
              if (value == null || value === '') return null
              return (
                <div key={key} className="flex flex-col items-center p-2 rounded-lg bg-background border border-border/50">
                  <span className="text-lg mb-1" role="img" aria-hidden="true">{icon}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
                  <span className="text-sm font-semibold mt-0.5 text-center break-all">{value}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
