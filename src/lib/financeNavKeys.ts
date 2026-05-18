export interface FinanceNavKeyDef {
  key: string
  label: string
  group: 'Day-to-day' | 'Reporting' | 'Planning' | 'Reference'
}

// Overview is always visible and has no key.
// Admin is always visible and is not configurable.
// Simple Budget Planner has its own separate toggle (showBudgetPlanner).
export const FINANCE_NAV_KEYS: FinanceNavKeyDef[] = [
  { key: 'accounts',        label: 'Accounts',           group: 'Day-to-day' },
  { key: 'transactions',    label: 'Transactions',       group: 'Day-to-day' },
  { key: 'bills',           label: 'Bills',              group: 'Day-to-day' },
  { key: 'income',          label: 'Income',             group: 'Day-to-day' },
  { key: 'templates',       label: 'Templates',          group: 'Day-to-day' },
  { key: 'drafts',          label: 'Drafts',             group: 'Day-to-day' },
  { key: 'profitLoss',      label: 'P&L',                group: 'Reporting'  },
  { key: 'annualPnl',       label: 'Annual P&L',         group: 'Reporting'  },
  { key: 'balanceSheet',    label: 'Balance Sheet',      group: 'Reporting'  },
  { key: 'taxReport',       label: 'Tax Report',         group: 'Reporting'  },
  { key: 'journals',        label: 'Journals',           group: 'Reporting'  },
  { key: 'trialBalance',    label: 'Trial Balance / GL', group: 'Reporting'  },
  { key: 'apAging',         label: 'AP Aging',           group: 'Reporting'  },
  { key: 'arAging',         label: 'AR Aging',           group: 'Reporting'  },
  { key: 'bas',             label: 'BAS Worksheet',      group: 'Reporting'  },
  { key: 'vendorStatement', label: 'Statements',         group: 'Reporting'  },
  { key: 'reports',         label: 'Reports',            group: 'Reporting'  },
  { key: 'budget',          label: 'Budget',             group: 'Planning'   },
  { key: 'goals',           label: 'Goals',              group: 'Planning'   },
  { key: 'contacts',        label: 'Financial Contacts', group: 'Reference'  },
  { key: 'entities',        label: 'Entities',           group: 'Reference'  },
  { key: 'members',         label: 'Members',            group: 'Reference'  },
  { key: 'locations',       label: 'Locations',          group: 'Reference'  },
  { key: 'categories',      label: 'Chart of Accounts',  group: 'Reference'  },
]

export const FINANCE_NAV_GROUPS = ['Day-to-day', 'Reporting', 'Planning', 'Reference'] as const
export type FinanceNavGroup = typeof FINANCE_NAV_GROUPS[number]

/** Returns true if a nav key should be visible given the stored financeNav prefs. Defaults to visible. */
export function isNavKeyVisible(financeNav: Record<string, boolean>, key: string): boolean {
  return financeNav[key] !== false
}
