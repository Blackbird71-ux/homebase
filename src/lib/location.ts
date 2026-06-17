import { prisma } from '@/lib/prisma'

// Server-only helpers for opt-in family location sharing.
// Web apps can only read GPS while the app is in the foreground, so a row here
// represents a member's *last-known* position, not live tracking.

export interface FamilyMemberLocation {
  userId: string
  name: string
  lat: number
  lng: number
  accuracy: number | null
  updatedAt: Date
}

/**
 * Upsert the caller's own last-known location. No-ops (returns false) when the
 * user has location sharing turned off, so a stale capture can never leak.
 */
export async function recordUserLocation(
  userId: string,
  familyId: string,
  lat: number,
  lng: number,
  accuracy: number | null,
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, familyId },
    select: { shareLocation: true },
  })
  if (!user?.shareLocation) return false

  await prisma.userLocation.upsert({
    where: { userId },
    create: { userId, familyId, lat, lng, accuracy },
    update: { lat, lng, accuracy },
  })
  return true
}

/** Last-known locations of family members who currently share, scoped to the family. */
export async function getFamilyLocations(familyId: string): Promise<FamilyMemberLocation[]> {
  const rows = await prisma.userLocation.findMany({
    where: { familyId, user: { shareLocation: true } },
    select: {
      userId: true,
      lat: true,
      lng: true,
      accuracy: true,
      updatedAt: true,
      user: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    lat: r.lat,
    lng: r.lng,
    accuracy: r.accuracy,
    updatedAt: r.updatedAt,
  }))
}

/** Remove a user's stored location (e.g. when they turn sharing off). */
export async function clearUserLocation(userId: string): Promise<void> {
  await prisma.userLocation.deleteMany({ where: { userId } })
}
