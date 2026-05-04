/**
 * Run once: node generate-favicon.js
 * Generates public/favicon.ico from public/icon-192.png using sharp (already installed).
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, 'public', 'icon-192.png')
const dest = path.join(__dirname, 'public', 'favicon.ico')

async function main() {
  // ICO format: concatenate 16x16 and 32x32 PNG images with ICO header
  const [img16, img32] = await Promise.all([
    sharp(src).resize(16, 16).png().toBuffer(),
    sharp(src).resize(32, 32).png().toBuffer(),
  ])

  // Build a minimal ICO file (ICONDIR + 2 ICONDIRENTRY + image data)
  const numImages = 2
  const headerSize = 6
  const entrySize = 16
  const dataOffset = headerSize + entrySize * numImages

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)        // Reserved
  header.writeUInt16LE(1, 2)        // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4)

  const entry16 = Buffer.alloc(entrySize)
  entry16.writeUInt8(16, 0)         // Width
  entry16.writeUInt8(16, 1)         // Height
  entry16.writeUInt8(0, 2)          // Color count (0 = more than 256)
  entry16.writeUInt8(0, 3)          // Reserved
  entry16.writeUInt16LE(1, 4)       // Color planes
  entry16.writeUInt16LE(32, 6)      // Bits per pixel
  entry16.writeUInt32LE(img16.length, 8)
  entry16.writeUInt32LE(dataOffset, 12)

  const entry32 = Buffer.alloc(entrySize)
  entry32.writeUInt8(32, 0)
  entry32.writeUInt8(32, 1)
  entry32.writeUInt8(0, 2)
  entry32.writeUInt8(0, 3)
  entry32.writeUInt16LE(1, 4)
  entry32.writeUInt16LE(32, 6)
  entry32.writeUInt32LE(img32.length, 8)
  entry32.writeUInt32LE(dataOffset + img16.length, 12)

  const ico = Buffer.concat([header, entry16, entry32, img16, img32])
  fs.writeFileSync(dest, ico)
  console.log(`✓ favicon.ico written to public/ (${ico.length} bytes)`)
}

main().catch(err => { console.error(err); process.exit(1) })
