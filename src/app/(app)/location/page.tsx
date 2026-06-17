import { requireSession } from '@/lib/auth-helpers'
import { PageHero } from '@/components/shared/PageHero'
import { FamilyLocationView } from '@/components/location/FamilyLocationView'

export default async function LocationPage() {
  await requireSession()

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <PageHero title="Locations" />
      <div className="flex-1 min-h-0 mt-4">
        <FamilyLocationView />
      </div>
    </div>
  )
}
