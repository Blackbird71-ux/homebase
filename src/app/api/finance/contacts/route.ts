import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const vendors = await prisma.financeVendor.findMany({
    where: { familyId: session.familyId },
    include: {
      defaultCategory: { select: { id: true, name: true, color: true } },
      _count: { select: { recurringBills: true, transactions: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(vendors)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, website, phone, accountRef, notes, defaultCategoryId } = json

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const vendor = await prisma.financeVendor.create({
    data: {
      name: name.trim(),
      website: website || null,
      phone: phone || null,
      accountRef: accountRef || null,
      notes: notes || null,
      defaultCategoryId: defaultCategoryId || null,
      familyId: session.familyId,
    },
    include: {
      defaultCategory: { select: { id: true, name: true, color: true } },
      _count: { select: { recurringBills: true, transactions: true } },
    },
  })
  return NextResponse.json(vendor, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, website, phone, accountRef, notes, defaultCategoryId } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeVendor.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const vendor = await prisma.financeVendor.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(website !== undefined && { website: website || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(accountRef !== undefined && { accountRef: accountRef || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(defaultCategoryId !== undefined && { defaultCategoryId: defaultCategoryId || null }),
    },
    include: {
      defaultCategory: { select: { id: true, name: true, color: true } },
      _count: { select: { recurringBills: true, transactions: true } },
    },
  })
  return NextResponse.json(vendor)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeVendor.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  await prisma.financeVendor.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
