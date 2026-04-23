export type UserRole = 'admin' | 'member'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  familyId: string
  weekStartsOn: number
  timezone: string  // IANA timezone string e.g. 'Australia/Sydney'
}

export interface DashboardData {
  upcomingEvents: UpcomingEvent[]
  tonightsDinner: TonightsDinner | null
  shoppingList: ShoppingListSummary | null
  todoSummary: TodoSummary | null
}

export interface UpcomingEvent {
  id: string
  title: string
  start: string
  end: string
  isAllDay: boolean
  category: string | null
  color: string | null
}

export interface TonightsDinner {
  mealPlanId: string
  recipeId: string | null
  recipeName: string | null
  recipeImage: string | null
  note: string | null
}

export interface MealPlanRecipe {
  id: string
  recipeId: string
  order: number
  courseType: string | null
  recipe: {
    id: string
    title: string
  }
}

export interface MealPlan {
  id: string
  date: string
  mealType: string
  note: string | null
  familyId: string
  recipeId: string | null
  recipe: {
    id: string
    title: string
  } | null
  recipes: MealPlanRecipe[]
}

export interface ShoppingListSummary {
  listId: string
  listName: string
  totalItems: number
  pendingItems: number
  firstItems: string[]
}

export interface TodoSummary {
  listId: string
  listName: string
  dueTodayCount: number
  firstItems: string[]
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  isAllDay: boolean
  isPersonal: boolean
  isBusy: boolean
  category: string | null
  color: string | null
  createdBy: string
  // Recurrence fields
  recurrenceRule?: string | null
  recurrenceEndDate?: string | null
  recurrenceExceptions?: string | null
  seriesId?: string | null
  isRecurring?: boolean
}

// Custom theme color definitions
export interface CustomThemeColors {
  // Sidebar
  sidebar?: string
  sidebarForeground?: string
  sidebarPrimary?: string
  sidebarPrimaryForeground?: string
  sidebarAccent?: string
  sidebarAccentForeground?: string
  sidebarBorder?: string
  sidebarRing?: string
  
  // Calendar
  calendarBackground?: string
  calendarEvent?: string
  calendarEventHover?: string
  calendarText?: string
  calendarBorder?: string
  
  // Cards
  card?: string
  cardForeground?: string
  cardBorder?: string
  cardHover?: string
  
  // Text
  textPrimary?: string
  textSecondary?: string
  textMuted?: string
  textAccent?: string
  
  // Buttons
  buttonPrimary?: string
  buttonPrimaryForeground?: string
  buttonSecondary?: string
  buttonSecondaryForeground?: string
  buttonAccent?: string
  buttonAccentForeground?: string
  
  // General
  background?: string
  foreground?: string
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
  accent?: string
  accentForeground?: string
  muted?: string
  mutedForeground?: string
  border?: string
  input?: string
  ring?: string
  destructive?: string
}

export interface UIPreferences {
  customTheme?: CustomThemeColors
  // other UI preferences can be added here
}

// Extend NextAuth session types
// Note: next-auth v5 beta augmentation — kept for reference
// The actual augmentation is in src/auth.ts once next-auth is configured
export type NextAuthSession = {
  user: {
    id: string
    email: string
    name: string
    role: string
    familyId: string
  }
}
