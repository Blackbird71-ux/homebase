import { prisma } from '@/lib/prisma'

/**
 * Finance module default category icon-color mapping
 * Keyed by the category name for easy lookup
 */
export const DEFAULT_FINANCE_CATEGORIES: Array<{
  name: string
  type: 'expense' | 'income' | 'transfer'
  icon: string
  color: string
}> = [
  // ─── Expense Categories ─────────────────────────────────────────
  { name: 'Housing / Rent',       type: 'expense', icon: 'home',          color: '#6366F1' },
  { name: 'Mortgage',             type: 'expense', icon: 'building',      color: '#6366F1' },
  { name: 'Electricity',          type: 'expense', icon: 'zap',           color: '#EAB308' },
  { name: 'Gas',                  type: 'expense', icon: 'flame',         color: '#F97316' },
  { name: 'Water',                type: 'expense', icon: 'droplets',      color: '#3B82F6' },
  { name: 'Internet',             type: 'expense', icon: 'wifi',          color: '#8B5CF6' },
  { name: 'Mobile Phone',         type: 'expense', icon: 'smartphone',    color: '#8B5CF6' },
  { name: 'Groceries',            type: 'expense', icon: 'shopping-cart', color: '#22C55E' },
  { name: 'Dining Out',           type: 'expense', icon: 'utensils',      color: '#F59E0B' },
  { name: 'Coffee & Café',        type: 'expense', icon: 'coffee',        color: '#92400E' },
  { name: 'Car Loan',             type: 'expense', icon: 'car',           color: '#64748B' },
  { name: 'Fuel',                 type: 'expense', icon: 'fuel',          color: '#EF4444' },
  { name: 'Car Insurance',        type: 'expense', icon: 'shield',        color: '#64748B' },
  { name: 'Registration',         type: 'expense', icon: 'file-text',     color: '#64748B' },
  { name: 'Parking',              type: 'expense', icon: 'parking-circle',color: '#64748B' },
  { name: 'Public Transport',     type: 'expense', icon: 'bus',           color: '#0EA5E9' },
  { name: 'Health Insurance',     type: 'expense', icon: 'heart-pulse',   color: '#EC4899' },
  { name: 'Medical / Dental',     type: 'expense', icon: 'stethoscope',   color: '#EC4899' },
  { name: 'Pharmacy',             type: 'expense', icon: 'pill',          color: '#EC4899' },
  { name: 'Childcare',            type: 'expense', icon: 'baby',          color: '#F472B6' },
  { name: 'School Fees',          type: 'expense', icon: 'graduation-cap',color: '#F472B6' },
  { name: 'Clothing',             type: 'expense', icon: 'shirt',         color: '#A78BFA' },
  { name: 'Personal Care',        type: 'expense', icon: 'sparkles',      color: '#A78BFA' },
  { name: 'Streaming Services',   type: 'expense', icon: 'tv',            color: '#1D4ED8' },
  { name: 'Other Subscriptions',  type: 'expense', icon: 'repeat',        color: '#1D4ED8' },
  { name: 'Entertainment',        type: 'expense', icon: 'clapperboard',  color: '#7C3AED' },
  { name: 'Holidays / Travel',    type: 'expense', icon: 'plane',         color: '#0891B2' },
  { name: 'Gym & Fitness',        type: 'expense', icon: 'dumbbell',      color: '#059669' },
  { name: 'Pet Care',             type: 'expense', icon: 'paw-print',     color: '#B45309' },
  { name: 'Gifts',                type: 'expense', icon: 'gift',          color: '#DB2777' },
  { name: 'Charity',              type: 'expense', icon: 'hand-heart',    color: '#DB2777' },
  { name: 'Household Supplies',   type: 'expense', icon: 'package',       color: '#78716C' },
  { name: 'Home Maintenance',     type: 'expense', icon: 'wrench',        color: '#78716C' },
  { name: 'Home Insurance',       type: 'expense', icon: 'shield-check',  color: '#78716C' },
  { name: 'Savings Transfer',     type: 'expense', icon: 'piggy-bank',    color: '#10B981' },
  { name: 'Other Expense',        type: 'expense', icon: 'circle-dot',    color: '#6B7280' },
  // ─── Income Categories ─────────────────────────────────────────
  { name: 'Salary / Wages',       type: 'income',  icon: 'briefcase',     color: '#10B981' },
  { name: 'Freelance / Contractor',type: 'income',  icon: 'laptop',        color: '#10B981' },
  { name: 'Investment Return',    type: 'income',  icon: 'trending-up',   color: '#10B981' },
  { name: 'Rental Income',        type: 'income',  icon: 'building-2',    color: '#10B981' },
  { name: 'Government Benefit',   type: 'income',  icon: 'landmark',      color: '#10B981' },
  { name: 'Tax Return',           type: 'income',  icon: 'receipt',       color: '#10B981' },
  { name: 'Other Income',         type: 'income',  icon: 'plus-circle',   color: '#10B981' },
]

/**
 * Idempotent seed: ensures default finance categories exist for a family.
 * Safe to call multiple times — skips categories that already exist.
 */
export async function seedFinanceCategories(familyId: string): Promise<void> {
  const existing = await prisma.financeCategory.findMany({
    where: { familyId, isSystem: true },
    select: { name: true },
  })
  const existingNames = new Set(existing.map((c) => c.name))

  const toCreate = DEFAULT_FINANCE_CATEGORIES.filter(
    (cat) => !existingNames.has(cat.name)
  ).map((cat, idx) => ({
    name: cat.name,
    type: cat.type,
    icon: cat.icon,
    color: cat.color,
    isSystem: true,
    sortOrder: idx,
    familyId,
  }))

  if (toCreate.length > 0) {
    await prisma.financeCategory.createMany({ data: toCreate })
    console.log(`[finance-seed] Seeded ${toCreate.length} categories for family ${familyId}`)
  }
}