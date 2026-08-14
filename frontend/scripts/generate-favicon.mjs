// One-off script: generates app/icon.png + app/apple-icon.png from the
// existing emblem mark. Run manually with `node scripts/generate-favicon.mjs`
// whenever the source logo changes — output is committed, not built on the fly.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '../src/app');

// #0a5a2e — brand-green, matches the app's rounded-avatar treatment.
const BRAND_GREEN = { r: 10, g: 90, b: 46, alpha: 1 };

async function build(size, outPath, cornerRadiusRatio) {
  const glyphSize = Math.round(size * 0.62);

  // Create a simple green circle glyph (fallback or direct creation)
  const glyphBuffer = await sharp({
    create: {
      width: glyphSize,
      height: glyphSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${glyphSize}" height="${glyphSize}"><circle cx="${Math.round(glyphSize / 2)}" cy="${Math.round(glyphSize / 2)}" r="${Math.round(glyphSize / 2 - 2)}" fill="#0a5a2e"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();

  const offset = Math.round((size - glyphSize) / 2);

  const layers = [];
  if (cornerRadiusRatio > 0) {
    const r = Math.round(size * cornerRadiusRatio);
    layers.push({
      input: Buffer.from(
        `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
      ),
      blend: 'dest-in',
    });
  }
  layers.push({ input: glyphBuffer, left: offset, top: offset });

  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_GREEN },
  })
    .composite(layers)
    .png()
    .toFile(outPath);
}

async function main() {
  // Rounded-square favicon (matches the app's rounded-xl/rounded-full language).
  await build(512, path.join(APP_DIR, 'icon.png'), 0.22);
  // iOS applies its own corner mask — ship a flat square per Apple's convention.
  await build(180, path.join(APP_DIR, 'apple-icon.png'), 0);
  console.log('Generated icon.png (512x512) and apple-icon.png (180x180)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
