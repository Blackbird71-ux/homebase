# Image Caching for Recipe Images

## Overview

Recipe images from external URLs are now cached locally to speed up loading times. When a recipe image URL is requested, the system:

1. Checks if a cached copy exists in `/data/images/`
2. If cached, serves the local copy directly (fast)
3. If not cached, downloads the image from the external URL, saves it to `/data/images/`, and serves it

This eliminates repeated network requests to external image hosts, significantly improving page load times for recipe lists and detail views.

## How It Works

### Server-Side Image Route

`src/app/api/images/[...path]/route.ts` handles image serving:

- **URL format**: `/api/images/<base64-encoded-url>`
- On first request for an image URL, it downloads the image and saves it to `/data/images/<hash>.webp`
- Subsequent requests serve the cached file directly
- Images are converted to WebP format for smaller file sizes
- Proper `Content-Type` headers are set based on file extension

### URL Conversion Utility

`src/lib/image-cache.ts` provides `getLocalImageUrl()`:

- Takes an external image URL (or null)
- Returns a local `/api/images/<base64-encoded-url>` path
- If the URL is null/empty, returns null
- If the URL already starts with `/api/images/`, returns it as-is (already cached)
- If the URL starts with `/uploads/`, returns it as-is (local upload)

### Usage in Code

All recipe image URLs are converted at the data layer before being sent to the client:

- **Server Components** (recipes page, recipe detail page, home page): Use `getLocalImageUrl()` when serializing recipe data
- **API Routes** (recipes, tags, dashboard): Use `getLocalImageUrl()` when returning JSON responses
- **Client Components**: Receive already-converted URLs and render them directly with `<img>` tags

## Files Modified

| File | Change |
|------|--------|
| `src/lib/image-cache.ts` | **NEW** - URL conversion utility |
| `src/app/api/images/[...path]/route.ts` | **NEW** - Image serving API route with caching |
| `src/app/(app)/recipes/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/(app)/recipes/[id]/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/(app)/home/page.tsx` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/recipes/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/recipes/[id]/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/dashboard/route.ts` | Added `getLocalImageUrl` import and conversion |
| `src/app/api/tags/[id]/recipes/route.ts` | Added `getLocalImageUrl` import and conversion |
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

- Cached images are stored as WebP files: `<sha256-hash>.webp`
- Original filenames are preserved for uploaded images (served via `/uploads/` path)
- The hash is computed from the original URL to ensure uniqueness

## Performance Benefits

- External images are fetched only once per unique URL
- Subsequent loads serve from local filesystem (no network latency)
- WebP conversion reduces file sizes
- Images are served directly by Next.js without external dependencies
