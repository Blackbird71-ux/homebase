# Bug Fix: Chores Audit Log Argument Order

**Date:** 2026-05-15

## Problem

Docker build failed at the `npm run build` step with a TypeScript error:

```
./src/app/api/chores/[id]/route.ts:159:10
Type error: Expected 5-6 arguments, but got 1.
```

## Root Cause

[`createAuditLog()`](src/lib/audit-log.ts:25) expects **5-6 positional arguments**:

- `user: SessionUser`
- `action: AuditAction` (`'create' | 'update' | 'delete' | 'undo'`)
- `entity: AuditEntity`
- `entityId: string`
- `summary: string`
- `details?: Record<string, unknown> | null` (optional)

Both the `PATCH` (UPDATE) and `DELETE` handlers in [`src/app/api/chores/[id]/route.ts`](src/app/api/chores/[id]/route.ts) were calling it with a **single object argument** instead. All 39 other call sites across the codebase use the positional format correctly.

Additionally, the object keys used non-standard action values (`'CHORE_UPDATED'`, `'CHORE_DELETED'`) that don't match the `AuditAction` union type.

## Solution

Converted both call sites to use the positional argument format matching the function signature and the rest of the codebase.

### Files Changed

#### 1. `src/app/api/chores/[id]/route.ts` — PATCH handler (line 159)

**Before:**
```typescript
void createAuditLog({
  action: 'CHORE_UPDATED',
  entityType: 'chore',
  entityId: id,
  familyId: user.familyId,
  userId: user.id,
  metadata: { changedFields, previous: existing, current: updated },
})
```

**After:**
```typescript
void createAuditLog(
  user,
  'update',
  'chore',
  id,
  `Updated chore: ${updated.title}`,
  { changedFields, previous: existing, current: updated }
)
```

#### 2. `src/app/api/chores/[id]/route.ts` — DELETE handler (line 200)

**Before:**
```typescript
void createAuditLog({
  action: 'CHORE_DELETED',
  entityType: 'chore',
  entityId: id,
  familyId: user.familyId,
  userId: user.id,
  metadata: { title: existing.title },
})
```

**After:**
```typescript
void createAuditLog(
  user,
  'delete',
  'chore',
  id,
  `Deleted chore "${existing.title}"`,
  { title: existing.title }
)
```
