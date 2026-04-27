import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { family: { select: { timezone: true } } },
        })

        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          familyId: user.familyId,
          timezone: user.family.timezone,
          weekStartsOn: user.weekStartsOn,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as SessionUser).role
        token.familyId = (user as SessionUser).familyId
        token.timezone = (user as SessionUser).timezone
        token.weekStartsOn = (user as SessionUser).weekStartsOn
      }
      return token
    },
    // Re-read timezone and weekStartsOn from DB on every auth() call so that
    // admin changes to these fields take effect without requiring sign-out.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.familyId = token.familyId as string
        // Always fetch mutable family settings fresh from DB
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { weekStartsOn: true, family: { select: { timezone: true } } },
        })
        session.user.timezone = fresh?.family.timezone ?? (token.timezone as string)
        session.user.weekStartsOn = fresh?.weekStartsOn ?? (token.weekStartsOn as number)
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
