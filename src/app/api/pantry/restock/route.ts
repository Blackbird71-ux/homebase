import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { restockPantryItems } from '@/lib/pantry'

// Bulk "we just bought these": flips matching pantry items to stocked and
// creates new stocked items for the rest. Called from the shopping-list
// checkoff prompt.
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { names } = body as { names: string[] }

  if (!Array.isArray(names) || names.length === 0 || names.some(n => typeof n !== 'string')) {
    return NextResponse.json({ error: 'names must be a non-empty string array' }, { status: 400 })
  }

  const result = await restockPantryItems(user.familyId, names)
  return NextResponse.json(result)
}
