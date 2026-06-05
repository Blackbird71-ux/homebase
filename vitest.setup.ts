import { vi } from 'vitest'

// Global mock of @/lib/auth — the single module that imports `next-auth`.
//
// Why: this project runs a forked Next (16.2.4) whose package.json exposes no
// `./server` subpath export and ships no node_modules/next/server.js. Only Next's
// own bundler aliases `next/server`; Node/Vite (which Vitest uses) cannot resolve
// it. `next-auth`'s lib/env.js does `import … from 'next/server'`, so any suite
// that transitively loads @/lib/auth crashes at collection with
//   Cannot find module '…/node_modules/next/server' imported from …/next-auth/lib/env.js
// Mocking @/lib/auth here cuts that import chain for every suite, so no individual
// test needs to remember to mock it. Suites that mock @/lib/auth themselves (e.g.
// the finance integration tests) override this; suites that don't touch auth are
// unaffected.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
