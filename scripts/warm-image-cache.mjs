#!/usr/bin/env node
/**
 * Warm the HomeBase image cache by fetching uncached recipe images locally
 * and writing them directly to the data/images folder (via network share).
 *
 * Usage:
 *   node scripts/warm-image-cache.mjs <images-dir> [base-url]
 *
 * Examples (adjust share path to match your setup):
 *   node scripts/warm-image-cache.mjs "\\\\NAS\\homebase\\images"
 *   node scripts/warm-image-cache.mjs "\\\\NAS\\homebase\\images" https://homebase.liddleapps.com
 *   node scripts/warm-image-cache.mjs /mnt/homebase/images http://localhost:3000
 *
 * Requires the IMAGE_CACHE_TOKEN env var (must match the server's value) — the
 * /api/images/uncached endpoint is token-gated.
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const imagesDir = process.argv[2]
const baseUrl = (process.argv[3] ?? 'https://homebase.liddleapps.com').replace(/\/$/, '')
const cacheToken = process.env.IMAGE_CACHE_TOKEN

if (!imagesDir) {
  console.error('Usage: node scripts/warm-image-cache.mjs <images-dir> [base-url]')
  console.error('  images-dir  path to the data/images folder (local or network share)')
  console.error('  base-url    HomeBase server URL (default: https://homebase.liddleapps.com)')
  process.exit(1)
}

if (!cacheToken) {
  console.error('Missing IMAGE_CACHE_TOKEN env var — set it to the same value configured on the server.')
  process.exit(1)
}

async function main() {
  console.log(`Server:     ${baseUrl}`)
  console.log(`Images dir: ${imagesDir}`)
  console.log()

  const listRes = await fetch(`${baseUrl}/api/images/uncached`, {
    headers: { 'x-cache-token': cacheToken },
  })
  if (!listRes.ok) throw new Error(`Failed to fetch uncached list: ${listRes.status} ${listRes.statusText}`)
  const items = await listRes.json()

  if (items.length === 0) {
    console.log('All images are already cached.')
    return
  }

  console.log(`Found ${items.length} uncached image(s)\n`)
  await mkdir(imagesDir, { recursive: true })

  let ok = 0
  let skip = 0
  let fail = 0

  for (const { url, cachePath } of items) {
    try {
      const imgRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': new URL(url).origin + '/',
        },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      })

      if (!imgRes.ok) {
        console.warn(`  SKIP ${cachePath}  (upstream ${imgRes.status})`)
        skip++
        continue
      }

      const contentType = imgRes.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        console.warn(`  SKIP ${cachePath}  (unexpected content-type: ${contentType})`)
        skip++
        continue
      }

      const buffer = Buffer.from(await imgRes.arrayBuffer())
      await writeFile(join(imagesDir, cachePath), buffer)
      console.log(`  OK   ${cachePath}  (${(buffer.length / 1024).toFixed(0)} KB)`)
      ok++
    } catch (err) {
      console.warn(`  FAIL ${cachePath}  ${err.message}`)
      fail++
    }
  }

  console.log()
  console.log(`Done: ${ok} cached, ${skip} skipped, ${fail} failed`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
