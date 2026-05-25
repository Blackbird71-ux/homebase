import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

// ── Finance Reference Data ────────────────────────────────────────────────────
//
// Returns accounts, categories, members, locations, and entities in a single
// round-trip. Intended for pages that need all five datasets for dropdowns and
// filters (transactions, income, bills).
//
// Data is intentionally lightweight — no usage counts, no balance derivation.
// Use the individual endpoints when richer data is needed.

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { familyId } = user

  const [accounts, categories, members, locations, entities] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId },
      select: { id: true, name: true, type: true, currency: true, color: true, icon: true, isActive: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeCategory.findMany({
      where: { familyId, hideFromReports: false },
      select: {
        id: true, name: true, type: true, parentId: true, icon: true, color: true,
        isSystem: true, sortOrder: true, level: true,
        isPersonal: true, isLocationBased: true, isExternal: true,
        isTaxDeduction: true, taxIncludeInReporting: true, taxDisplayLabel: true,
        glCode: true, gstApplicable: true, gstRate: true, hideFromReports: true,
      },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.user.findMany({
      where: { familyId },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.financeLocation.findMany({
      where: { familyId },
      select: { id: true, name: true, address: true, type: true, isActive: true, color: true, icon: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeEntity.findMany({
      where: { familyId, isActive: true },
      select: { id: true, name: true, type: true, description: true, color: true, icon: true, isDefault: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  return NextResponse.json({ accounts, categories, members, locations, entities })
}
