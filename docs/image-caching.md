# Image Caching for Recipe Images

## Overview

Recipe images from external URLs are cached locally to speed up loading times. The system uses a **proxy-and-cache** approach:

1. **Always** serves images through `/api/images/` so requests go through our server
2. If a cached copy exists in `/data/images/`, serves from disk (fast)
3. If not cached, fetches from the original URL, saves to `/data/images/`, and serves it
4. Subsequent requests serve the cached file directly

This eliminates repeated network requests to external image hosts and builds the cache naturally as users browse recipes.

## How It Works

### Server-Side Image Route

`src/app/api/images/[...path]/route.ts` handles image serving:

- **URL format**: `/api/images/<md5-hash>.<ext>?url=<original-url>`
- On first request, it fetches the image from the original URL (passed as `?url=` query param), saves it to `/data/images/<hash>.<ext>`, and serves it
- Subsequent requests serve the cached file directly from disk
- Proper `Content-Type` headers are set based on file extension
- Cache-Control is set to `public, max-age=31536000, immutable` for cached images

### URL Conversion Utility

`src/lib/image-cache.ts` provides `getLocalImageUrl()`:

- Takes an external image URL (or null)
- Returns `/api/images/<hash>.<ext>?url=<encoded-original>` for external URLs
- If the URL is already a local path (starts with `/`), returns it as-is
- If the URL is a bare filename (legacy data), checks if it exists in `/data/uploads/`
- If the URL is null/empty, returns null

### Cache Population

The cache builds naturally as users browse recipes:

1. **First view**: Image URL is converted to `/api/images/hash.jpg?url=https://...` → server fetches from source, caches it, serves it
2. **Subsequent views**: Image URL is converted to `/api/images/hash.jpg?url=https://...` → server finds cached file on disk, serves it directly

During **import**, images are cached eagerly using `cacheImage()` and stored with the `/api/images/` path directly in the database.

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
