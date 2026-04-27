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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = (user as SessionUser).role
        token.familyId = (user as SessionUser).familyId
        token.timezone = (user as SessionUser).timezone
        token.weekStartsOn = (user as SessionUser).weekStartsOn
      }
      // Called by session.update() on the client — re-read mutable fields from DB
      // so timezone/weekStartsOn changes take effect without requiring sign-out.
      if (trigger === 'update') {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { weekStartsOn: true, family: { select: { timezone: true } } },
        })
        if (fresh) {
          token.timezone = fresh.family.timezone
          token.weekStartsOn = fresh.weekStartsOn
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.familyId = token.familyId as string
        session.user.timezone = token.timezone as string
        session.user.weekStartsOn = token.weekStartsOn as number
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
