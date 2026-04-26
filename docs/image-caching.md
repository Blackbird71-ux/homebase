# Image Caching for Recipe Images

## Overview

Recipe images from external URLs are cached locally to speed up loading and reduce external dependencies. The system uses a **proxy-and-cache** approach with intelligent fallback:

1. **Cacheable external URLs** — server fetches on first request, caches to `/data/images/`, serves from disk thereafter
2. **Uncacheable URLs** (e.g. Umami's `/api/image/` endpoints) — if already warmed to disk, served from cache; otherwise browser fetches them directly
3. **Fetch failures** — the server issues a 302 redirect to the original URL so the browser can fetch it directly; images always display, never break

## Uncacheable URLs

Some image sources cannot be fetched server-side because they use Next.js image optimization or application proxy endpoints that may block non-browser requests. The known patterns are:

- `/_next/image` — Next.js Image Optimization API
- `/api/image/` — Application image proxy endpoints (used by Umami Recipes)

These URLs are not proxied through `/api/images/`. Instead:
- If the file has been written to disk (e.g. via the warm script), `getLocalImageUrl()` returns the cached `/api/images/<hash>.jpg` path
- If not yet on disk, the original URL is returned and the browser fetches it directly

## Warming the Cache (Umami Images)

Because uncacheable images aren't automatically fetched server-side during import, a separate warm script is provided.

### Prerequisites

- The `/data/images/` folder mounted as a Windows network share (e.g. `\\Sovereign-Main\docker\homebase\Data\images`)
- PowerShell (built into Windows)

### Run the warm script

```powershell
.\scripts\warm-image-cache.ps1 -ImagesDir "\\Sovereign-Main\docker\homebase\Data\images"
```

Optional: override the server URL (default is `https://homebase.liddleapps.com`):

```powershell
.\scripts\warm-image-cache.ps1 -ImagesDir "\\Sovereign-Main\docker\homebase\Data\images" -BaseUrl "https://homebase.liddleapps.com"
```

If PowerShell blocks the script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### What the script does

1. Calls `GET /api/images/uncached` to get all recipe image URLs that are external and not yet on disk
2. Fetches each image from your local machine (where the image host is publicly accessible)
3. Writes files directly to the network share using the MD5-hash filename the server expects

Re-run the script any time new recipes are imported. Already-cached images are skipped automatically.

### After warming

On the next page load, `getLocalImageUrl()` detects the files on disk and switches those recipes to serve from `/api/images/<hash>.jpg` — no further external requests.

## How It Works

### Server-Side Image Route

`src/app/api/images/[...path]/route.ts` — handles all image serving:

- **URL format**: `/api/images/<md5-hash>.<ext>?url=<original-url>`
- Cached on disk → served immediately with `Cache-Control: immutable`
- Not cached → fetches from `?url=` with browser-like headers, writes to disk, serves response
- Fetch fails (non-2xx or network error) → 302 redirect to original URL so browser can fetch directly
- Security: blocks `..` traversal and multi-segment paths

### URL Conversion Utility

`src/lib/image-cache.ts` — converts raw DB image URLs to the URL the UI should use:

| Input | Output |
|-------|--------|
| `null` / empty | `null` |
| Already a local path (`/...`) | returned as-is |
| Bare filename (legacy upload) | `/uploads/<filename>` if file exists, else `null` |
| Uncacheable external URL, file on disk | `/api/images/<hash>.<ext>` (served from cache) |
| Uncacheable external URL, not on disk | original URL (browser fetches directly) |
| Other external URL | `/api/images/<hash>.<ext>?url=<encoded>` (proxy + cache on first hit) |

Key functions:

- `getLocalImageUrl(url)` — used everywhere before sending image URLs to the client
- `cacheImage(url)` — eagerly downloads and caches an image server-side (skips uncacheable URLs)
- `getCachePath(url)` — returns the deterministic `<md5>.<ext>` filename for a URL
- `isCached(cachePath)` — checks if the file exists on disk

### Uncached Image List Endpoint

`GET /api/images/uncached` — returns all recipe image URLs that are external HTTP(S) and not yet cached on disk. No auth required (image URLs are not sensitive). Used by the warm script.

### Cache Population

- **Import**: `cacheImage()` is called for each imported recipe image. Cacheable URLs are downloaded immediately; uncacheable URLs are skipped (original URL stored in DB).
- **Browsing**: cacheable images not yet on disk are fetched and cached on first page view via the proxy route.
- **Warming**: run `warm-image-cache.ps1` to populate uncacheable images from your local machine.

### Usage in Code

All image URLs are converted at the data layer before being sent to the client:

- **Server components** and **API routes**: call `getLocalImageUrl()` when serializing recipe data
- **Client components**: receive already-converted URLs and render with `<img>` tags directly

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Root data directory. Override to `./data` for local dev. |

Set in `.env.local` for local development:

```
DATA_DIR=./data
```

## File Locations

| Context | Path |
|---------|------|
| Inside container | `/data/images/` |
| On NAS (network share) | `\\Sovereign-Main\docker\homebase\Data\images` |
| Local dev | `./data/images/` |

## Image Storage Format

Files are stored as `<md5-hash-of-original-url>.<ext>` — the extension comes from the original URL's path (defaults to `.jpg` if none detected). The hash is deterministic so the same URL always maps to the same filename.
