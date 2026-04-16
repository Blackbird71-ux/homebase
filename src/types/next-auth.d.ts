import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      familyId: string
    } & DefaultSession['user']
  }

  interface User {
    role?: string
    familyId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    familyId?: string
  }
}
