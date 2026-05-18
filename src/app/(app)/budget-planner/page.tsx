import { requireSession } from '@/lib/auth-helpers'
import { BudgetPlannerClient } from '@/components/budget-planner/BudgetPlannerClient'

export default async function BudgetPlannerPage() {
  await requireSession()
  return <BudgetPlannerClient />
}
