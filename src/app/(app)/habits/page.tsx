import { requireSession } from '@/lib/auth-helpers'
import { habitCtxFromUser, listHabits } from '@/lib/habits'
import { PageHero } from '@/components/shared/PageHero'
import { HabitsClient } from './HabitsClient'

export default async function HabitsPage() {
  const user = await requireSession()
  const habits = await listHabits(habitCtxFromUser(user), { includeInactive: true })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHero title="Habits" subtitle="Daily and weekly habits, with streaks." />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-4">
        <HabitsClient initialHabits={habits} />
      </div>
    </div>
  )
}
