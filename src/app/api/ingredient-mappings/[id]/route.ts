import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  
  // Verify the mapping belongs to the user's family
  const mapping = await prisma.ingredientMapping.findFirst({
    where: { id, familyId: user.familyId },
  })
  
  if (!mapping) {
    return NextResponse.json(
      { error: 'Mapping not found' },
      { status: 404 }
    )
  }
  
  await prisma.ingredientMapping.delete({
    where: { id },
  })
  
  return NextResponse.json({ success: true })
}