import { prisma } from '@/lib/prisma'
import { House } from 'lucide-react'
import { LoginForm } from './LoginForm'

const DEFAULT_TAGLINE = 'The calm command centre for the people who share your roof.'
const DEFAULT_VERSION = '3.2'

export default async function LoginPage() {
  let tagline = DEFAULT_TAGLINE
  let version = DEFAULT_VERSION
  try {
    const family = await prisma.family.findFirst({ select: { loginTagline: true, appVersion: true } })
    if (family?.loginTagline) tagline = family.loginTagline
    if (family?.appVersion) version = family.appVersion
  } catch {
    // DB not ready yet — use default
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-foreground text-background shrink-0">
            <House className="size-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Homebase</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-5xl font-serif font-normal leading-tight tracking-tight text-foreground">
            Welcome home.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tagline}
          </p>
        </div>

        <LoginForm />

        <p className="text-xs text-muted-foreground">
          v{version} · Made for households, not teams.
        </p>
      </div>
    </div>
  )
}
