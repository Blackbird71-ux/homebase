import { requireSession } from '@/lib/auth-helpers'
import { TagManager } from '@/components/tags/TagManager'

export default async function TagsSettingsPage() {
  await requireSession()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Tag Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage tags for organizing recipes. Tags are shared across your family.
        </p>
      </div>

      <div className="flex-1 p-6">
        <TagManager />
      </div>
    </div>
  )
}