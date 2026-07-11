import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'

// Throttle for session-callback DB-failure logging: the callback runs on every
// request, so during an outage we log at most once per minute instead of per hit.
let lastSessionDbErrorLogAt = 0

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

        // Emails are stored lowercased (see register route); normalise the
        // login lookup the same way so mixed-case sign-ins still match.
        const user = await prisma.user.findUnique({
          where: { email: (credentials.email as string).toLowerCase().trim() },
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
    // Re-read mutable fields from DB on every auth() call so that
    // admin changes take effect without requiring sign-out.
    // Falls back to JWT token values when the DB is unreachable (SQLite lock,
    // disk full, etc.) so the app degrades gracefully instead of 500-ing
    // every page and API route. Token values may be stale, but stale auth
    // is better than no auth.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { familyId: true, weekStartsOn: true, family: { select: { timezone: true } } },
          })
          session.user.familyId = fresh?.familyId ?? (token.familyId as string)
          session.user.timezone = fresh?.family.timezone ?? (token.timezone as string)
          session.user.weekStartsOn = fresh?.weekStartsOn ?? (token.weekStartsOn as number)
        } catch (err) {
          const now = Date.now()
          if (now - lastSessionDbErrorLogAt > 60_000) {
            lastSessionDbErrorLogAt = now
            console.error('[auth] session callback DB read failed; falling back to JWT token values:', err)
          }
          // DB unreachable — fall back to JWT token values (set at login)
          session.user.familyId = token.familyId as string
          session.user.timezone = token.timezone as string
          session.user.weekStartsOn = token.weekStartsOn as number
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
