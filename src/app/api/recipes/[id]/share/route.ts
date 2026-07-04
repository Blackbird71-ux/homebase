import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { sendEmail } from '@/lib/email'
import { recipeShareHtml } from '@/lib/email-templates'

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

async function _POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const recipe = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
    select: {
      id: true,
      title: true,
      description: true,
      ingredients: true,
      instructions: true,
      prepTime: true,
      cookTime: true,
      servings: true,
      notes: true,
      sourceUrl: true,
    },
  })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const emails: string[] = Array.isArray(body.emails) ? body.emails : []
  const message: string | undefined = body.message || undefined

  const validEmails = emails.filter(isValidEmail)
  if (!validEmails.length) {
    return NextResponse.json({ error: 'No valid email addresses provided' }, { status: 400 })
  }

  const recipeData = {
    title: recipe.title,
    description: recipe.description,
    ingredients: JSON.parse(recipe.ingredients) as string[],
    instructions: JSON.parse(recipe.instructions) as string[],
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    notes: recipe.notes,
    sourceUrl: recipe.sourceUrl,
  }

  await Promise.all(
    validEmails.map((email) =>
      sendEmail({
        to: email,
        subject: `Recipe: ${recipe.title}`,
        html: recipeShareHtml(recipeData, user.name ?? 'Someone', message),
      })
    )
  )

  return NextResponse.json({ success: true, sent: validEmails.length })
}

export const POST = withRouteErrors(_POST)
