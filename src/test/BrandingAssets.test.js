// @vitest-environment node
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { generateServiceWorker } from '../../build/pwa.js';

const metadata = JSON.parse(await readFile('resources/branding/assets.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assetRoot = `/branding/${metadata.version}/`;
const pngSize = bytes => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

function rgbaPixels(bytes) {
  expect(bytes[25]).toBe(6); // True RGBA, not RGB with a painted background.
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += 12 + size;
  }
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const above = y ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + above - upperLeft;
      const distances = [Math.abs(p - left), Math.abs(p - above), Math.abs(p - upperLeft)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? above : upperLeft;
      const prediction = [0, left, above, Math.floor((left + above) / 2), paeth][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + prediction) % 256;
    }
  }
  return { width, height, pixels };
}

it('has transparent margins and lightning cutouts, identical geometry in both contrast versions, and clean edge colours', async () => {
  const white = rgbaPixels(await readFile(resolve('public', assetRoot.slice(1), 'logo.png')));
  const dark = rgbaPixels(await readFile(resolve('public', assetRoot.slice(1), 'logo-on-light.png')));
  expect([white.width, white.height, dark.width, dark.height]).toEqual([576, 576, 576, 576]);
  let opaque = 0, transparent = 0, soft = 0, differentAlpha = 0, badMargin = 0, badInk = 0;
  for (let y = 0; y < white.height; y++) for (let x = 0; x < white.width; x++) {
    const i = (y * white.width + x) * 4, alpha = white.pixels[i + 3];
    if (dark.pixels[i + 3] !== alpha) differentAlpha++;
    if ((x < 10 || y < 10 || x >= white.width - 10 || y >= white.height - 10) && alpha) badMargin++;
    if (alpha === 0) transparent++;
    else {
      if (alpha === 255) opaque++; else soft++;
      if (white.pixels[i] !== 255 || white.pixels[i + 1] !== 255 || white.pixels[i + 2] !== 255 ||
        dark.pixels[i] !== 27 || dark.pixels[i + 1] !== 32 || dark.pixels[i + 2] !== 26) badInk++;
    }
  }
  // The document's inner bolt must remain a real transparent cutout.
  expect(white.pixels[(240 * white.width + 200) * 4 + 3]).toBe(0);
  expect({ differentAlpha, badMargin, badInk }).toEqual({ differentAlpha: 0, badMargin: 0, badInk: 0 });
  expect(transparent).toBeGreaterThan(120000);
  expect(opaque).toBeGreaterThan(120000);
  expect(soft).toBeGreaterThan(1000);
});

it('retains the exact user originals and a full-size native packaging master', async () => {
  for (const [name, expected] of Object.entries(metadata.originals)) {
    const bytes = await readFile(resolve('resources/branding', name));
    expect(hash(bytes)).toBe(expected);
    expect(pngSize(bytes)).toBe('1254x1254');
  }
  expect(pngSize(await readFile('resources/branding/avatar-master-1024.png'))).toBe('1024x1024');
});

it('uses versioned, distinct ordinary and maskable icons while retaining PWA identity', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
  expect(manifest).toMatchObject({ name: 'Storm Archive', short_name: 'Storm Archive', id: '/', start_url: '/', scope: '/', display: 'standalone' });
  expect(manifest.icons).toHaveLength(3);
  expect(new Set(manifest.icons.map(icon => icon.src)).size).toBe(3);
  expect(manifest.icons.map(icon => icon.purpose)).toEqual(['any', 'any', 'maskable']);
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith(assetRoot)).toBe(true);
    expect(pngSize(await readFile(resolve('public', icon.src.slice(1))))).toBe(icon.sizes);
  }
});

it('provides real PNG favicon entries inside ICO, matching standalone browser sizes', async () => {
  const html = await readFile('index.html', 'utf8');
  expect(html).toContain(`/favicon.ico?v=${metadata.version}`);
  expect(html).not.toContain('favicon.svg');
  const ico = await readFile('public/favicon.ico');
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(6);
  for (const [i, size] of [16, 32, 48, 64, 128, 256].entries()) {
    const entry = 6 + i * 16;
    expect(ico[entry] || 256).toBe(size);
    expect(ico[entry + 1] || 256).toBe(size);
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    const bytes = ico.subarray(offset, offset + length);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(pngSize(bytes)).toBe(`${size}x${size}`);
    if (size <= 32) {
      const path = `${assetRoot}favicon-${size}.png`;
      expect(html).toContain(path);
      expect(bytes.equals(await readFile(resolve('public', path.slice(1))))).toBe(true);
    }
  }
});

it('precaches every new runtime brand asset and versions icon changes without shipping originals', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'storm-branding-unit-'));
  try {
    await cp('public', directory, { recursive: true });
    await cp('index.html', resolve(directory, 'index.html'));
    const first = await generateServiceWorker(directory, resolve('src/pwa/sw.js'));
    const paths = first.resources.map(item => item.url);
    for (const name of ['logo.png', 'logo-on-light.png', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png']) {
      expect(paths).toContain(assetRoot + name);
    }
    expect(paths).toContain('/favicon.ico');
    expect(paths.some(path => /original|master-1024|\.py$|favicon\.svg/.test(path))).toBe(false);
    await cp('resources/branding/avatar-master-1024.png', resolve(directory, 'branding', metadata.version, 'pwa-512.png'));
    expect((await generateServiceWorker(directory, resolve('src/pwa/sw.js'))).version).not.toBe(first.version);
  } finally {
    if (!directory.startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});
