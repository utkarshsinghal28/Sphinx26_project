import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
const root = join(process.cwd(), 'dist');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
}
const files = (await walk(root)).filter(f => !f.endsWith('/sw.js') && !f.endsWith('/precache-assets.json')).sort();
const paths = ['/', ...files.map(f => '/' + relative(root, f).split(sep).join('/'))];
const hash = createHash('sha256');
for (const file of files) { hash.update(file); hash.update(await readFile(file)); }
const version = hash.digest('hex').slice(0, 12);
await writeFile(join(root, 'precache-assets.json'), JSON.stringify(paths));
const serviceWorker = await readFile(join(root, 'sw.js'), 'utf8');
await writeFile(join(root, 'sw.js'), serviceWorker.replace('__CACHE_VERSION__', version));
console.log(`PWA shell: ${paths.length} files, version ${version}`);
