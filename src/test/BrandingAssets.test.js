// @vitest-environment node
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { generateServiceWorker } from '../../build/pwa.js';

const metadata = JSON.parse(await readFile('resources/branding/assets.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assetRoot = `/branding/${metadata.version}/`;
const pngSize = bytes => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

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
    for (const name of ['logo.png', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png']) {
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
