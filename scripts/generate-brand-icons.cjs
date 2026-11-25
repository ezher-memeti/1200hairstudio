// Deterministic size variants of the approved image; no cropping or redesign.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const source = path.join(root, 'public/brand/profile.png');
  await fs.mkdir(path.join(root, 'public/icons'), { recursive: true });
  const resize = size => sharp(source).rotate().resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  for (const size of [16, 32, 192]) await fs.writeFile(path.join(root, `public/icons/favicon-${size}x${size}.png`), await resize(size));
  await fs.writeFile(path.join(root, 'public/icons/app-512x512.png'), await resize(512));
  await fs.writeFile(path.join(root, 'public/apple-touch-icon.png'), await resize(180));
  // Standard ICO directory with PNG-compressed 16, 32 and 48px images.
  const sizes = [16, 32, 48], images = await Promise.all(sizes.map(resize));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (let index = 0; index < sizes.length; index++) {
    const entry = 6 + index * 16;
    header[entry] = sizes[index]; header[entry + 1] = sizes[index];
    const metadata = await sharp(images[index]).metadata();
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(metadata.channels * 8, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  }
  await fs.writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([header, ...images]));
  console.log('Generated favicon ICO (16/32/48), PNG (16/32/192) and Apple touch icon (180) from the unchanged profile.png.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
