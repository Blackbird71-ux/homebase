export type UserRole = 'admin' | 'member'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  familyId: string
  weekStartsOn: number
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
  recipeName: string | null
  note: string | null
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
  category: string | null
  color: string | null
  createdBy: string
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
