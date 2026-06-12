import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { resolveBarcode, teachBarcode } from '@/lib/pantry'

// GET: resolve a scanned barcode to a product name (learned mapping first,
// then Open Food Facts). 404 body { resolved: false } means "ask the user
// to name it once", then POST the name back here to teach it.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { code } = await params

  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ error: 'invalid barcode' }, { status: 400 })
  }

  const result = await resolveBarcode(user.familyId, code)
  if (!result) return NextResponse.json({ resolved: false }, { status: 404 })
  return NextResponse.json({ resolved: true, ...result })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { code } = await params
  const body = await req.json()
  const { productName } = body

  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ error: 'invalid barcode' }, { status: 400 })
  }
  if (!productName?.trim()) {
    return NextResponse.json({ error: 'productName is required' }, { status: 400 })
  }

  const mapping = await teachBarcode(user.familyId, code, productName)
  return NextResponse.json(mapping)
}
