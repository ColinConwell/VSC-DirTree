import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yauzl from 'yauzl';

const archive = process.argv[2] || 'dirtree.vsix';
const expected = [
  '[Content_Types].xml',
  'extension.vsixmanifest',
  ...[
    'package.json',
    'readme.md',
    'changelog.md',
    'LICENSE.txt',
    'THIRD_PARTY_NOTICES.txt',
    'dist/extension.cjs',
    'dist/extension-web.cjs',
    'dist/webview.js',
    'dist/webview.css',
    'media/dirtree.svg',
    'media/icon.png',
  ].map((file) => 'extension/' + file),
].sort();
const files = new Map();
await new Promise((resolve, reject) => {
  yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', (entry) => {
      if (files.has(entry.fileName)) {
        zip.close();
        return reject(new Error('Duplicate archive entry: ' + entry.fileName));
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('error', reject);
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          files.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
});
assert.deepEqual([...files.keys()].sort(), expected, 'Unexpected or missing release files');
for (const [name, content] of files) assert.ok(content.length, 'Empty release file: ' + name);
const manifest = JSON.parse(files.get('extension/package.json'));
const sourceManifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.version, sourceManifest.version);
assert.equal(manifest.publisher + '.' + manifest.name, 'ColinConwell.vsc-dirtree');
assert.equal(manifest.displayName, 'DirTree');
assert.equal(manifest.author.name, 'Colin Conwell');
assert.equal(manifest.author.email, 'colinconwell@gmail.com');
assert.equal(manifest.license, 'GPL-3.0-only');
assert.equal(
  Object.keys(manifest.dependencies || {}).length,
  0,
  'Runtime dependencies must be bundled',
);
for (const file of [manifest.main, manifest.browser, manifest.icon]) {
  assert.ok(files.has('extension/' + file.replace(/^\.\//, '')), 'Missing runtime asset: ' + file);
}
const png = files.get('extension/' + manifest.icon);
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 256);
assert.equal(png.readUInt32BE(20), 256);
for (const file of [
  'dist/extension.cjs',
  'dist/extension-web.cjs',
  'dist/webview.js',
  'dist/webview.css',
]) {
  assert.doesNotMatch(files.get('extension/' + file).toString(), /sourceMappingURL=/);
  assert.deepEqual(
    files.get('extension/' + file),
    await readFile(file),
    'Stale packaged asset: ' + file,
  );
}
const notices = files.get('extension/THIRD_PARTY_NOTICES.txt').toString();
for (const name of ['react', 'react-dom', 'scheduler']) assert.ok(notices.includes(name + ' '));
assert.match(notices, /Permission is hereby granted/);
const xml = files.get('extension.vsixmanifest').toString();
assert.match(xml, /Microsoft\.VisualStudio\.Code/);
assert.match(xml, /__web_extension/);
assert.match(xml, /Microsoft\.VisualStudio\.Code\.ExtensionKind" Value="[^"]*\bweb\b/);
console.log(
  `${archive}: verified ${files.size} entries; only runtime assets, metadata, documentation, and licenses.`,
);
