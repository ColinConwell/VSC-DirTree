import { build, context } from 'esbuild';
import { readFile, writeFile, rm } from 'node:fs/promises';
const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');
const shared = {
  bundle: true,
  sourcemap: watch,
  logLevel: 'info',
  target: 'es2022',
  minify: !watch,
};
const testConfig = {
  ...shared,
  entryPoints: ['test/extension.test.ts'],
  outfile: 'dist/test/extension.test.cjs',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
};
const configs = tests
  ? [testConfig]
  : [
      {
        ...shared,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension.cjs',
        platform: 'node',
        format: 'cjs',
        external: ['vscode'],
      },
      {
        ...shared,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension-web.cjs',
        platform: 'browser',
        format: 'cjs',
        external: ['vscode'],
      },
      {
        ...shared,
        entryPoints: ['src/webview/main.tsx'],
        outfile: 'dist/webview.js',
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
        legalComments: 'none',
      },
    ];
if (!tests && !watch) await rm('dist', { recursive: true, force: true });
if (!tests) {
  const notices = ['Third-Party Notices\n\nDirTree bundles the following MIT-licensed packages.\n'];
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    const license = await readFile(`node_modules/${name}/LICENSE`, 'utf8');
    notices.push(`${name} ${pkg.version}\n${'='.repeat(60)}\n${license.trim()}\n`);
  }
  await writeFile('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
}
await Promise.all(
  configs.map(async (config) => (watch ? (await context(config)).watch() : build(config))),
);
