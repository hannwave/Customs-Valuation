const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../portal/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const brandRoot = path.join(root, 'portal/public/brand');

async function main() {
  // The supplied blue logo has exactly the same artwork as the white version.
  // Extract its foreground rather than guessing white-on-white boundaries or
  // redrawing either line of institutional lettering.
  const { data, info } = await sharp(path.join(brandRoot, 'customs-logo.png'))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const light = Buffer.alloc(info.width * info.height * 4);
  const color = Buffer.alloc(light.length);
  for (let p = 0; p < info.width * info.height; p++) {
    const r = data[p * info.channels];
    const g = data[p * info.channels + 1];
    const b = data[p * info.channels + 2];
    const yellow = r > b;
    // Undo the white matte at antialiased edges. The blue artwork's red
    // channel and the yellow artwork's blue channel both have a zero base.
    const alpha = 1 - (yellow ? b : r) / 255;
    if (alpha < 0.02 || Math.max(r, g, b) - Math.min(r, g, b) < 4) continue;
    const rgba = [r, g, b].map(value => Math.max(0, Math.min(255, Math.round((value - 255 * (1 - alpha)) / alpha))));
    const offset = p * 4;
    color.set([...rgba, Math.round(alpha * 255)], offset);
    light.set([...(yellow ? rgba : [255, 255, 255]), Math.round(alpha * 255)], offset);
  }
  const raw = { width: info.width, height: info.height, channels: 4 };
  await sharp(light, { raw }).png().toFile(path.join(brandRoot, 'customs-logo-light.png'));

  // Use only the supplied emblem at favicon size; the two text lines would
  // become illegible. These bounds enclose the emblem in the original image.
  const emblem = await sharp(color, { raw }).extract({ left: 165, top: 24, width: 518, height: 600 }).png().toBuffer();
  await sharp(emblem).resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png().toFile(path.join(root, 'portal/app/icon.png'));

  // Verification previews are ignored local artifacts, never public UI assets.
  const previewRoot = path.join(root, '.local-dev');
  fs.mkdirSync(previewRoot, { recursive: true });
  await sharp(light, { raw }).flatten({ background: '#102a56' }).resize({ width: 430 })
    .png().toFile(path.join(previewRoot, 'light-logo-on-navy.png'));
  const transparent = Array.from({ length: info.width * info.height }, (_, p) => light[p * 4 + 3]).filter(alpha => alpha === 0).length;
  if (transparent === 0 || transparent === info.width * info.height) throw new Error('Foreground/background extraction failed.');
  console.log(`Created transparent light logo and browser icon; ${transparent} fully transparent pixels.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
