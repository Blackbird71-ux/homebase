// src/lib/global-search.ts
// Server-only: cross-module search for the command palette.
// Every query is scoped to familyId. Privacy rules:
//  - Private notes are only returned to their creator.
//  - PIN-secured notes/contacts/documents match on title/name only — never on
//    their protected content/notes fields.
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { formatInTz } from '@/lib/timezone'

export type SearchResultType =
  | 'recipe' | 'note' | 'contact' | 'document'
  | 'event' | 'list' | 'trip' | 'asset'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  url: string
}

const TAKE = 5

export async function globalSearch(
  familyId: string,
  userId: string,
  query: string
): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const timezone = await getFamilyTimezone(familyId)

  const [recipes, notes, contacts, documents, events, lists, trips, assets] =
    await Promise.all([
      prisma.recipe.findMany({
        where: {
          familyId,
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { ingredients: { contains: q } },
            { tags: { contains: q } },
          ],
        },
        select: { id: true, title: true, description: true },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      prisma.note.findMany({
        where: {
          familyId,
          isArchived: false,
          AND: [
            { OR: [{ isPrivate: false }, { createdBy: userId }] },
            {
              OR: [
                { title: { contains: q } },
                { AND: [{ pinHash: null }, { content: { contains: q } }] },
              ],
            },
          ],
        },
        select: { id: true, title: true, category: true },
        orderBy: { updatedAt: 'desc' },
        take: TAKE,
      }),
      prisma.householdContact.findMany({
        where: {
          familyId,
          OR: [
            { name: { contains: q } },
            {
              AND: [
                { pinHash: null },
                {
                  OR: [
                    { phone: { contains: q } },
                    { email: { contains: q } },
                    { notes: { contains: q } },
                  ],
                },
              ],
            },
          ],
        },
        select: { id: true, name: true, category: true, phone: true },
        orderBy: { name: 'asc' },
        take: TAKE,
      }),
      prisma.document.findMany({
        where: {
          familyId,
          OR: [
            { title: { contains: q } },
            {
              AND: [
                { pinHash: null },
                { OR: [{ fileName: { contains: q } }, { notes: { contains: q } }] },
              ],
            },
          ],
        },
        select: { id: true, title: true, category: true },
        orderBy: { updatedAt: 'desc' },
        take: TAKE,
      }),
      prisma.event.findMany({
        where: {
          familyId,
          OR: [
            { title: { contains: q } },
            { location: { contains: q } },
            { description: { contains: q } },
          ],
        },
        select: { id: true, title: true, start: true },
        orderBy: { start: 'desc' },
        take: TAKE,
      }),
      prisma.list.findMany({
        where: { familyId, isActive: true, name: { contains: q } },
        select: { id: true, name: true, type: true },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      prisma.trip.findMany({
        where: {
          familyId,
          OR: [{ title: { contains: q } }, { destination: { contains: q } }],
        },
        select: { id: true, title: true, destination: true, startDate: true },
        orderBy: { startDate: 'desc' },
        take: TAKE,
      }),
      prisma.homeAsset.findMany({
        where: {
          familyId,
          isActive: true,
          OR: [
            { name: { contains: q } },
            { make: { contains: q } },
            { model: { contains: q } },
          ],
        },
        select: { id: true, name: true, category: true },
        orderBy: { name: 'asc' },
        take: TAKE,
      }),
    ])

  const dateOpts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', year: 'numeric',
  }

  return [
    ...recipes.map((r): SearchResult => ({
      type: 'recipe', id: r.id, title: r.title,
      subtitle: r.description ?? undefined,
      url: `/recipes/${r.id}`,
    })),
    ...notes.map((n): SearchResult => ({
      type: 'note', id: n.id, title: n.title,
      subtitle: n.category ?? undefined,
      url: `/notes/${n.id}`,
    })),
    ...contacts.map((c): SearchResult => ({
      type: 'contact', id: c.id, title: c.name,
      subtitle: c.phone ?? c.category,
      url: '/contacts',
    })),
    ...documents.map((d): SearchResult => ({
      type: 'document', id: d.id, title: d.title,
      subtitle: d.category,
      url: '/documents',
    })),
    ...events.map((e): SearchResult => ({
      type: 'event', id: e.id, title: e.title,
      subtitle: formatInTz(e.start, timezone, dateOpts),
      url: '/calendar',
    })),
    ...lists.map((l): SearchResult => ({
      type: 'list', id: l.id, title: l.name,
      subtitle: l.type.toLowerCase(),
      url: `/lists?list=${l.id}`,
    })),
    ...trips.map((t): SearchResult => ({
      type: 'trip', id: t.id, title: t.title,
      subtitle: `${t.destination} · ${formatInTz(t.startDate, timezone, dateOpts)}`,
      url: `/trips/${t.id}`,
    })),
    ...assets.map((a): SearchResult => ({
      type: 'asset', id: a.id, title: a.name,
      subtitle: a.category,
      url: '/maintenance',
    })),
  ]
}
