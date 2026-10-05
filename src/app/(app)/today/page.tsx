import { requireSession } from '@/lib/auth-helpers'
import { getTodayData } from '@/lib/today-data'
import { normalizeWeekStart } from '@/lib/habit-helpers'
import { PageHero } from '@/components/shared/PageHero'
import { TodayClient } from './TodayClient'

export default async function TodayPage() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'UTC'
  const data = await getTodayData({ familyId: user.familyId, userId: user.id, timezone, scope: 'mine', weekStartsOn: normalizeWeekStart(user.weekStartsOn) })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 sm:px-6 pt-4">
        <PageHero title="Today" subtitle="Events, chores, to-dos, meals and habits for today." />
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-4">
        <TodayClient initialData={data} timezone={timezone} />
      </div>
    </div>
  )
}
