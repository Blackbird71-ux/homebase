export type QuickAction =
  | 'event' | 'chore' | 'expense' | 'list-item'
  | 'shopping-list' | 'todo-list' | 'recipe' | 'meal' | 'note'
  | 'pantry-item' | 'ai' | 'help'

export interface QuickAddFormProps {
  onSuccess: (message: string, navigate?: () => void) => void
  onBack: () => void
}

export interface ListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
}

export interface CategoryMeta {
  id: string
  name: string
  type: string
  parentId: string | null
  glCode?: string | null
}

export interface AccountMeta {
  id: string
  name: string
  type: string
  institution: string | null
}
