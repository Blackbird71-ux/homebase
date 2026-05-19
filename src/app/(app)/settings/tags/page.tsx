import { requireSession } from '@/lib/auth-helpers'
import { TagManager } from '@/components/tags/TagManager'
import { PageHero } from '@/components/shared/PageHero'

export default async function TagsSettingsPage() {
  await requireSession()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHero title="Tag Settings" subtitle="Manage tags for recipes, notes, and trips. Tags are shared across your family." />

      <div className="flex-1 p-6">
        <TagManager />
      </div>
    </div>
  )
}
