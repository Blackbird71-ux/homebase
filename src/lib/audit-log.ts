import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'

export type AuditAction = 'create' | 'update' | 'delete' | 'undo'
export type AuditEntity = 'event' | 'list' | 'listItem' | 'recipe' | 'chore' | 'contact' | 'note' | 'document' | 'mealPlan' | 'tag'

export interface AuditLogEntry {
  id: string
  familyId: string
  userId: string
  userName: string
  action: AuditAction
  entity: AuditEntity
  entityId: string
  summary: string
  details: string | null
  createdAt: string
}

/**
 * Create an audit log entry.
 * This is a fire-and-forget operation — it never throws.
 * Returns the created entry ID or null on failure.
 */
export async function createAuditLog(
  user: SessionUser,
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  summary: string,
  details?: Record<string, unknown> | null
): Promise<string | null> {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        familyId: user.familyId,
        userId: user.id,
        userName: user.name,
        action,
        entity,
        entityId,
        summary,
        details: details ? JSON.stringify(details) : null,
      },
    })
    return entry.id
  } catch (err) {
    console.error('[audit-log] Failed to create entry:', err)
    return null
  }
}

/**
 * Get audit log entries for a family, with pagination.
 */
export async function getAuditLogs(
  familyId: string,
  options?: {
    limit?: number
    offset?: number
    entity?: AuditEntity
    entityId?: string
  }
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const { limit = 50, offset = 0, entity, entityId } = options ?? {}

  const where: Record<string, unknown> = { familyId }
  if (entity) where.entity = entity
  if (entityId) where.entityId = entityId

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    entries: entries.map((e) => ({
      id: e.id,
      familyId: e.familyId,
      userId: e.userId,
      userName: e.userName,
      action: e.action as AuditAction,
      entity: e.entity as AuditEntity,
      entityId: e.entityId,
      summary: e.summary,
      details: e.details,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  }
}

/**
 * Get a single audit log entry by ID.
 */
export async function getAuditLogById(
  id: string,
  familyId: string
): Promise<AuditLogEntry | null> {
  const entry = await prisma.auditLog.findFirst({
    where: { id, familyId },
  })
  if (!entry) return null
  return {
    id: entry.id,
    familyId: entry.familyId,
    userId: entry.userId,
    userName: entry.userName,
    action: entry.action as AuditAction,
    entity: entry.entity as AuditEntity,
    entityId: entry.entityId,
    summary: entry.summary,
    details: entry.details,
    createdAt: entry.createdAt.toISOString(),
  }
}

/**
 * Undo a previous action by creating a compensating entry.
 * This is a placeholder — actual undo logic depends on the entity type.
 * Returns the new audit log entry ID or null.
 */
export async function undoAuditLog(
  user: SessionUser,
  logId: string
): Promise<{ success: boolean; message: string }> {
  const entry = await prisma.auditLog.findFirst({
    where: { id: logId, familyId: user.familyId },
  })

  if (!entry) {
    return { success: false, message: 'Audit log entry not found' }
  }

  // Cannot undo an undo
  if (entry.action === 'undo') {
    return { success: false, message: 'Cannot undo an undo action' }
  }

  // Parse details to understand what to restore
  let details: Record<string, unknown> | null = null
  if (entry.details) {
    try {
      details = JSON.parse(entry.details)
    } catch {
      // ignore parse errors
    }
  }

  try {
    switch (entry.entity) {
      case 'event': {
        if (entry.action === 'delete' && details?.event) {
          // Restore deleted event
          const eventData = details.event as Record<string, unknown>
          await prisma.event.create({
            data: {
              id: entry.entityId,
              title: String(eventData.title ?? ''),
              description: eventData.description ? String(eventData.description) : null,
              start: new Date(String(eventData.start)),
              end: new Date(String(eventData.end)),
              isAllDay: Boolean(eventData.isAllDay ?? false),
              isPersonal: Boolean(eventData.isPersonal ?? false),
              category: eventData.category ? String(eventData.category) : null,
              color: eventData.color ? String(eventData.color) : null,
              createdBy: String(eventData.createdBy ?? entry.userId),
              familyId: entry.familyId,
              recurrenceRule: eventData.recurrenceRule ? String(eventData.recurrenceRule) : null,
              isRecurring: Boolean(eventData.isRecurring ?? false),
              recurrenceEndDate: eventData.recurrenceEndDate ? new Date(String(eventData.recurrenceEndDate)) : null,
            },
          })
        } else if (entry.action === 'create' && details?.eventId) {
          // Delete the created event
          await prisma.event.delete({ where: { id: entry.entityId } }).catch(() => {})
        } else if (entry.action === 'update' && details?.before) {
          // Restore previous state
          const before = details.before as Record<string, unknown>
          await prisma.event.update({
            where: { id: entry.entityId },
            data: {
              title: String(before.title ?? ''),
              description: before.description !== undefined ? String(before.description) : undefined,
              start: before.start ? new Date(String(before.start)) : undefined,
              end: before.end ? new Date(String(before.end)) : undefined,
              isAllDay: before.isAllDay !== undefined ? Boolean(before.isAllDay) : undefined,
              category: before.category !== undefined ? (before.category ? String(before.category) : null) : undefined,
              color: before.color !== undefined ? (before.color ? String(before.color) : null) : undefined,
            },
          })
        }
        break
      }

      case 'list': {
        if (entry.action === 'delete' && details?.list) {
          const listData = details.list as Record<string, unknown>
          await prisma.list.create({
            data: {
              id: entry.entityId,
              name: String(listData.name ?? ''),
              type: String(listData.type ?? 'SHOPPING'),
              isActive: Boolean(listData.isActive ?? true),
              familyId: entry.familyId,
            },
          })
        } else if (entry.action === 'create') {
          await prisma.list.delete({ where: { id: entry.entityId } }).catch(() => {})
        }
        break
      }

      case 'listItem': {
        if (entry.action === 'delete' && details?.item) {
          const itemData = details.item as Record<string, unknown>
          await prisma.listItem.create({
            data: {
              id: entry.entityId,
              content: String(itemData.content ?? ''),
              isCompleted: Boolean(itemData.isCompleted ?? false),
              category: itemData.category ? String(itemData.category) : null,
              sortOrder: Number(itemData.sortOrder ?? 0),
              dueDate: itemData.dueDate ? new Date(String(itemData.dueDate)) : null,
              createdBy: String(itemData.createdBy ?? entry.userId),
              listId: String(itemData.listId ?? ''),
            },
          })
        } else if (entry.action === 'create') {
          await prisma.listItem.delete({ where: { id: entry.entityId } }).catch(() => {})
        } else if (entry.action === 'update' && details?.before) {
          const before = details.before as Record<string, unknown>
          await prisma.listItem.update({
            where: { id: entry.entityId },
            data: {
              content: String(before.content ?? ''),
              isCompleted: Boolean(before.isCompleted ?? false),
              category: before.category !== undefined ? (before.category ? String(before.category) : null) : undefined,
            },
          })
        }
        break
      }

      case 'chore': {
        if (entry.action === 'delete' && details?.chore) {
          const choreData = details.chore as Record<string, unknown>
          await prisma.chore.create({
            data: {
              id: entry.entityId,
              title: String(choreData.title ?? ''),
              description: choreData.description ? String(choreData.description) : null,
              frequency: String(choreData.frequency ?? 'weekly'),
              dayOfWeek: choreData.dayOfWeek !== undefined ? Number(choreData.dayOfWeek) : null,
              dayOfMonth: choreData.dayOfMonth !== undefined ? Number(choreData.dayOfMonth) : null,
              rotationInterval: Number(choreData.rotationInterval ?? 1),
              familyId: entry.familyId,
              isActive: Boolean(choreData.isActive ?? true),
            },
          })
        } else if (entry.action === 'create') {
          await prisma.chore.delete({ where: { id: entry.entityId } }).catch(() => {})
        }
        break
      }

      case 'contact': {
        if (entry.action === 'delete' && details?.contact) {
          const contactData = details.contact as Record<string, unknown>
          await prisma.householdContact.create({
            data: {
              id: entry.entityId,
              name: String(contactData.name ?? ''),
              category: String(contactData.category ?? 'other'),
              phone: contactData.phone ? String(contactData.phone) : null,
              email: contactData.email ? String(contactData.email) : null,
              address: contactData.address ? String(contactData.address) : null,
              notes: contactData.notes ? String(contactData.notes) : null,
              familyId: entry.familyId,
            },
          })
        } else if (entry.action === 'create') {
          await prisma.householdContact.delete({ where: { id: entry.entityId } }).catch(() => {})
        }
        break
      }

      case 'note': {
        if (entry.action === 'delete' && details?.note) {
          const noteData = details.note as Record<string, unknown>
          await prisma.note.create({
            data: {
              id: entry.entityId,
              title: String(noteData.title ?? ''),
              content: String(noteData.content ?? ''),
              category: noteData.category ? String(noteData.category) : null,
              tags: noteData.tags ? String(noteData.tags) : null,
              createdBy: String(noteData.createdBy ?? entry.userId),
              familyId: entry.familyId,
            },
          })
        } else if (entry.action === 'create') {
          await prisma.note.delete({ where: { id: entry.entityId } }).catch(() => {})
        }
        break
      }

      case 'document': {
        if (entry.action === 'delete' && details?.document) {
          const docData = details.document as Record<string, unknown>
          await prisma.document.create({
            data: {
              id: entry.entityId,
              title: String(docData.title ?? ''),
              category: String(docData.category ?? 'other'),
              fileName: String(docData.fileName ?? ''),
              fileSize: Number(docData.fileSize ?? 0),
              mimeType: String(docData.mimeType ?? 'application/octet-stream'),
              notes: docData.notes ? String(docData.notes) : null,
              expiryDate: docData.expiryDate ? new Date(String(docData.expiryDate)) : null,
              remindBefore: Number(docData.remindBefore ?? 30),
              uploadedById: String(docData.uploadedById ?? entry.userId),
              familyId: entry.familyId,
            },
          })
        } else if (entry.action === 'create') {
          await prisma.document.delete({ where: { id: entry.entityId } }).catch(() => {})
        }
        break
      }

      default:
        return { success: false, message: `Undo not supported for entity type: ${entry.entity}` }
    }

    // Record the undo action
    await createAuditLog(
      user,
      'undo',
      entry.entity as AuditEntity,
      entry.entityId,
      `Undid: ${entry.summary}`,
      { originalLogId: logId }
    )

    return { success: true, message: `Successfully undid: ${entry.summary}` }
  } catch (err) {
    console.error('[audit-log] Undo failed:', err)
    return { success: false, message: 'Failed to undo action. See server logs.' }
  }
}
