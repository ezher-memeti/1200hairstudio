// Read-only binary checks of the real approved artwork and generated icon files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const og = await sharp(path.join(root, 'public/brand/open-graph.webp')).metadata();
  assert.equal(og.format, 'webp'); assert.equal(og.width, 1731); assert.equal(og.height, 909);
  const profile = await sharp(path.join(root, 'public/brand/profile.png')).metadata();
  assert.equal(profile.format, 'png'); assert.equal(profile.width, 1254); assert.equal(profile.height, 1254);
  for (const [file, size] of [['icons/favicon-16x16.png', 16], ['icons/favicon-32x32.png', 32], ['icons/favicon-192x192.png', 192], ['apple-touch-icon.png', 180]]) {
    const image = await sharp(path.join(root, 'public', file)).metadata();
    assert.equal(image.format, 'png'); assert.equal(image.width, size); assert.equal(image.height, size);
  }
  const ico = fs.readFileSync(path.join(root, 'public/favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16,32,48].entries()) {
    const entry = 6 + index * 16, length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert(offset >= 54 && offset + length <= ico.length);
    const image = await sharp(ico.subarray(offset, offset + length)).metadata();
    assert.equal(ico.readUInt16LE(entry + 6), image.channels * 8);
    assert.equal(ico[entry], size); assert.equal(image.width, size); assert.equal(image.height, size);
  }
  for (const file of ['src/app/favicon.ico','src/app/icon.png','src/app/apple-icon.png','src/app/opengraph-image.png','src/app/twitter-image.png']) assert(!fs.existsSync(path.join(root,file)), 'No file-based metadata override: '+file);
  console.log('PASS actual OG/profile dimensions and formats, PNG icon sizes, valid multi-image ICO and no conflicting default metadata assets. No files changed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
