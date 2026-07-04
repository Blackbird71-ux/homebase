import { NextResponse } from 'next/server'

type RouteHandler = (...args: any[]) => Promise<Response> | Response

/**
 * Wraps an API route handler so an unhandled throw returns a JSON 500
 * instead of an empty-body 500 (which clients see as "Unexpected end of
 * JSON input"). The response is generic by design — no error details leak
 * to the client; the real error goes to the server log.
 *
 * Every exported handler in src/app/api must be wrapped:
 *   export const GET = withRouteErrors(_GET)
 */
export function withRouteErrors<T extends RouteHandler>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      // Next.js control-flow errors (redirect/notFound) must propagate
      const digest = (error as { digest?: unknown })?.digest
      if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw error
      const req = args[0] as Request | undefined
      console.error(`Unhandled route error: ${req?.method ?? ''} ${req?.url ?? ''}`, error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }) as T
}
