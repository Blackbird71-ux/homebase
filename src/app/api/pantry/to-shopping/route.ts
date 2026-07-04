import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { addPantryItemsToShopping } from '@/lib/pantry'

// Add pantry items (by id) to the Groceries shopping list, skipping names
// already on it uncompleted. Called from the pantry page's
// "Add low/out to shopping" button.
async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { ids } = body as { ids: string[] }

  if (!Array.isArray(ids) || ids.length === 0 || ids.some(i => typeof i !== 'string')) {
    return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
  }

  const result = await addPantryItemsToShopping(user.familyId, user.id, ids)
  revalidatePath('/lists')
  return NextResponse.json(result)
}

export const POST = withRouteErrors(_POST)
