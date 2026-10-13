import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesUnder(resolve(directory, entry.name)) : resolve(directory, entry.name)));
  return nested.flat();
}

export async function generateServiceWorker(directory, templatePath) {
  const template = await readFile(templatePath, 'utf8');
  const files = (await filesUnder(directory)).filter(path => !path.endsWith('.map') &&
    relative(directory, path) !== 'sw.js' && !relative(directory, path).startsWith('.'));
  const resources = await Promise.all(files.sort().map(async path => ({
    url: '/' + relative(directory, path).split(sep).map(encodeURIComponent).join('/'),
    revision: digest(await readFile(path))
  })));
  if (!resources.some(item => item.url === '/index.html')) throw new Error('PWA build is missing index.html');
  const version = digest(template + JSON.stringify(resources)).slice(0, 24);
  const worker = template.replace('__STORM_VERSION__', JSON.stringify(version))
    .replace('__STORM_RESOURCES__', JSON.stringify(resources));
  await writeFile(resolve(directory, 'sw.js'), worker);
  return { version, resources };
}

export function stormPwa() {
  let root;
  return {
    name: 'storm-archive-pwa', apply: 'build',
    configResolved(config) {
      if (config.base !== '/') throw new Error('Storm Archive currently requires deployment at the domain root');
      root = config.root;
    },
    async writeBundle(options) {
      await generateServiceWorker(resolve(root, options.dir || 'dist'), resolve(root, 'src/pwa/sw.js'));
    }
  };
}
