import { requireSession } from '@/lib/auth-helpers'
import { CategoryManager } from '@/components/categories/CategoryManager'

export default async function CategoriesSettingsPage() {
  await requireSession()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Ingredient Category Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage categories for organizing ingredients in shopping lists.
        </p>
      </div>

      <div className="flex-1 p-6">
        <CategoryManager />
      </div>
    </div>
  )
}