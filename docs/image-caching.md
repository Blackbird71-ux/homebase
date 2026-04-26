# Image Caching for Recipe Images

## Overview

Recipe images from external URLs are cached locally where possible to speed up loading times. The system uses a **proxy-and-cache** approach with intelligent fallback for URLs that cannot be server-fetched:

1. **Cacheable external URLs** are served through `/api/images/` — the server fetches, caches to `/data/images/`, and serves from disk on subsequent requests
2. **Uncacheable URLs** (e.g. Next.js Image Optimization endpoints like Umami's `/api/image/` paths) are passed directly to the browser, which fetches them with its own session/cookies
3. If a cached copy already exists in `/data/images/`, it is served immediately from disk
4. If a server-side fetch fails for any reason, the route issues a **302 redirect** to the original URL so the browser can fetch it directly — images always display, never break

## Uncacheable URLs

Some image sources cannot be fetched server-side because they require browser session cookies or actively block non-browser requests. The known patterns are:

- `/_next/image` — Next.js Image Optimization API (used by Umami Recipes and other Next.js apps)
- `/api/image/` — Application image proxy endpoints (same issue)

For these URLs, `getLocalImageUrl()` returns the original URL unchanged and `cacheImage()` skips them immediately. The browser fetches them directly and they display normally — they just aren't cached on disk.

## How It Works

### Server-Side Image Route

`src/app/api/images/[...path]/route.ts` handles image serving:

- **URL format**: `/api/images/<md5-hash>.<ext>?url=<original-url>`
- If cached locally: serves from disk with `Cache-Control: immutable`
- If not cached: fetches from the original URL with browser-like headers, writes to disk, serves the response
- If the upstream fetch fails (non-2xx or network error): issues a **302 redirect** to the original URL — images still display via the browser
- Security: blocks `..` traversal and multi-segment paths

### URL Conversion Utility

`src/lib/image-cache.ts` provides `getLocalImageUrl()`:

- Takes an external image URL (or null)
- **Uncacheable URLs** (Next.js image opt / `/api/image/` paths): returned as-is for direct browser fetch
- **Cacheable external URLs**: returns `/api/images/<hash>.<ext>?url=<encoded-original>`
- Already a local path (starts with `/`): returned as-is
- Bare filename (legacy data): checks `/data/uploads/`, returns `/uploads/<filename>` or null
- null/empty: returns null

### Cache Population

The cache builds naturally as users browse recipes:

1. **First view of a cacheable image**: URL is converted to `/api/images/hash.jpg?url=https://...` → server fetches from source, caches it, serves it
2. **Subsequent views**: server finds cached file on disk, serves it directly (no external request)
3. **Uncacheable images**: browser fetches directly every time (no disk cache, but no broken images either)

During **import**, `cacheImage()` attempts eager caching — it silently skips uncacheable URLs and continues.

### Usage in Code

All recipe image URLs are converted at the data layer before being sent to the client:

- **Server Components** (recipes page, recipe detail page, home page): Use `getLocalImageUrl()` when serializing recipe data
- **API Routes** (recipes, tags, dashboard): Use `getLocalImageUrl()` when returning JSON responses
- **Client Components**: Receive already-converted URLs and render them directly with `<img>` tags

## Files Modified

| File | Change |
|------|--------|
| `src/lib/image-cache.ts` | **NEW** - URL conversion and caching utility |
| `src/app/api/images/[...path]/route.ts` | **NEW** - Image proxy/serving API route with on-the-fly caching |
| `src/app/(app)/recipes/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/(app)/recipes/[id]/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/(app)/home/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/recipes/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/recipes/[id]/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/dashboard/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/tags/[id]/recipes/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/recipes/import/route.ts` | Uses `cacheImage()` to eagerly cache during import |
| `docker/entrypoint.sh` | Already creates `/data/images` directory |
| `docker-compose.yml` | Added volume mount for images directory |
| `deploy-nas.sh` | Added volume mount and directory creation for images |

## Docker Configuration

### Volume Mount

The images directory is mounted from the NAS:

```yaml
volumes:
  - /volume1/homebase/Data/images:/data/images
```

### Directory Creation

The entrypoint script (`docker/entrypoint.sh`) already creates the `/data/images` directory on startup:

```sh
mkdir -p /data/images
chown -R nextjs:nodejs /data
```

## Cache Location

- **Inside container**: `/data/images/`
- **On NAS**: `/volume1/homebase/Data/images/`
- **Local dev**: `data/images/` (relative to project root)

## Image Storage Format

- Cached images are stored with their original extension: `<md5-hash>.<ext>`
- The hash is computed from the original URL to ensure uniqueness
- Original filenames are preserved for uploaded images (served via `/uploads/` path)

## Performance Benefits

- External images are fetched only once per unique URL
- Subsequent loads serve from local filesystem (no network latency)
- Images are served directly by Next.js without external dependencies
- Cache builds naturally as users browse - no upfront batch operation needed
