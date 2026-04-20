import { Coffee, Utensils, Pizza, Apple } from 'lucide-react'

export const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: Coffee, color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'lunch', label: 'Lunch', icon: Utensils, color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 'dinner', label: 'Dinner', icon: Pizza, color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'snacks', label: 'Snacks', icon: Apple, color: 'bg-green-100 text-green-800 border-green-300' },
] as const

export type MealType = typeof MEAL_TYPES[number]['id']

export const DEFAULT_MEAL_TYPE: MealType = 'dinner'

export function getMealTypeConfig(type: string) {
  return MEAL_TYPES.find(m => m.id === type) || MEAL_TYPES.find(m => m.id === DEFAULT_MEAL_TYPE)!
}

export function getMealTypeLabel(type: string): string {
  return getMealTypeConfig(type).label
}

export function getMealTypeIcon(type: string) {
  return getMealTypeConfig(type).icon
}

export function getMealTypeColor(type: string) {
  return getMealTypeConfig(type).color
}