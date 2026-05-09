import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const user = await requireSession()
  
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File
    const recipeId = formData.get('recipeId') as string
    
    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }
    
    if (!recipeId) {
      return NextResponse.json({ error: 'Recipe ID is required' }, { status: 400 })
    }
    
    // Verify recipe belongs to user's family
    const recipe = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        familyId: user.familyId,
      },
    })
    
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found or access denied' }, { status: 404 })
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be less than 5MB' }, { status: 400 })
    }
    
    // Create uploads directory if it doesn't exist
    const uploadDir = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'uploads')
    try {
      await mkdir(uploadDir, { recursive: true })
    } catch (err) {
      // Directory might already exist
    }
    
    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const filename = `recipe-${recipeId}-${timestamp}.${extension}`
    const filepath = join(uploadDir, filename)
    
    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)
    
    // Create relative path for storage in database
    // In Docker, this will be at /data/uploads
    const relativePath = `/uploads/${filename}`
    
    // Update recipe with image path
    const updatedRecipe = await prisma.recipe.update({
      where: { id: recipeId },
      data: { image: relativePath },
    })
    
    return NextResponse.json({
      success: true,
      imageUrl: relativePath,
      recipe: {
        id: updatedRecipe.id,
        title: updatedRecipe.title,
        image: updatedRecipe.image,
      },
    })
    
  } catch (error) {
    console.error('Image upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    )
  }
}