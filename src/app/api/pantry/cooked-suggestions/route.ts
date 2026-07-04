import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { suggestPantryDepletions } from '@/lib/pantry'

// Given the recipe ids of a cooked meal, return the pantry items their
// ingredients likely used. Read-only — the CookedItDialog lets the user
// confirm which to mark low/out via the normal PATCH /api/pantry/[id].
async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { recipeIds } = body as { recipeIds: string[] }

  if (!Array.isArray(recipeIds) || recipeIds.length === 0 || recipeIds.some(i => typeof i !== 'string')) {
    return NextResponse.json({ error: 'recipeIds must be a non-empty string array' }, { status: 400 })
  }

  const items = await suggestPantryDepletions(user.familyId, recipeIds)
  return NextResponse.json({ items })
}

export const POST = withRouteErrors(_POST)
