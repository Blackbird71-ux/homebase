// src/lib/ai/tools/index.ts
// Barrel file — registers all AI tool modules.
// Importing this file triggers registration of all tools.

import { registerMealPlanTools } from './meal-plan.tool'
import { registerShoppingTools } from './shopping.tool'
import { registerTodoTools } from './todo.tool'
import { registerCalendarTools } from './calendar.tool'
import { registerChoreTools } from './chores.tool'
import { registerRecipeTools } from './recipes.tool'
import { registerNoteTools } from './notes.tool'
import { registerContactTools } from './contacts.tool'
import { registerDocumentTools } from './documents.tool'
import { registerBirthdayTools } from './birthdays.tool'
import { registerFinanceBillTools } from './finance-bills.tool'
import { registerFinanceNLTransactionTools } from './finance-nl-transaction.tool'
import { registerFinanceAccountTools } from './finance-accounts.tool'
import { registerCalendarSummaryTools } from './calendar-summary.tool'
import { registerFinanceGoalTools } from './finance-goals.tool'
import { registerMealPlanSuggestTools } from './meal-plan-suggest.tool'
import { registerFinanceIncomeTools } from './finance-income.tool'
import { registerFamilyTools } from './family.tool'
import { registerFinanceTaxTools } from './finance-tax.tool'
import { registerMemoryTools } from './memory.tool'
import { registerReportTools } from './reports.tool'
import { registerReminderTools } from './reminders.tool'
import { registerDigestTools } from './digest.tool'
import { registerTripTools } from './trips.tool'

/**
 * Call this once at startup to register all AI tools.
 */
export function registerAllTools(): void {
  registerMealPlanTools()
  registerShoppingTools()
  registerTodoTools()
  registerCalendarTools()
  registerChoreTools()
  registerRecipeTools()
  registerNoteTools()
  registerContactTools()
  registerDocumentTools()
  registerBirthdayTools()
  registerFinanceBillTools()
  registerFinanceAccountTools()
  registerCalendarSummaryTools()
  registerFinanceGoalTools()
  registerMealPlanSuggestTools()
  registerFinanceIncomeTools()
  registerFamilyTools()
  registerFinanceTaxTools()
  registerMemoryTools()
  registerReportTools()
  registerReminderTools()
  registerFinanceNLTransactionTools()
  registerDigestTools()
  registerTripTools()
}
