import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stat } from 'fs/promises'

async function checkDatabaseHealth() {
  try {
    // Test database connection with a simple query
    await prisma.$queryRaw`SELECT 1`
    
    // Check if database file exists and get its size
    const dbPath = process.env.DATABASE_URL?.replace('file:', '')
    if (dbPath) {
      try {
        const stats = await stat(dbPath)
        return {
          connected: true,
          size: stats.size,
          path: dbPath,
          lastModified: stats.mtime.toISOString()
        }
      } catch {
        // File doesn't exist or can't be stat'd
        return {
          connected: true, // Prisma connected but file stats failed
          size: null,
          path: dbPath,
          error: 'Cannot stat database file'
        }
      }
    }
    
    return {
      connected: true,
      size: null,
      path: null
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function GET() {
  try {
    const dbHealth = await checkDatabaseHealth()
    const status = dbHealth.connected ? 'healthy' : 'unhealthy'
    
    const response = {
      status,
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: {
        node: process.version,
        platform: process.platform,
        databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set'
      }
    }
    
    return NextResponse.json(response, {
      status: dbHealth.connected ? 200 : 503
    })
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
