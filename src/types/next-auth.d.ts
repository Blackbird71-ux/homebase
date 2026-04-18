import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      familyId: string
      timezone: string
      weekStartsOn: number
    } & DefaultSession['user']
  }

  interface User {
    role?: string
    familyId?: string
    timezone?: string
    weekStartsOn?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    familyId?: string
    timezone?: string
    weekStartsOn?: number
  }
}
