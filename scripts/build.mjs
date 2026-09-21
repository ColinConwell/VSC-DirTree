import { build, context } from 'esbuild';
const watch = process.argv.includes('--watch');
const shared = {
  bundle: true,
  sourcemap: watch,
  logLevel: 'info',
  target: 'es2022',
  minify: !watch,
};
const configs = [
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
  },
  {
    ...shared,
    entryPoints: ['test/extension.test.ts'],
    outfile: 'dist/test/extension.test.cjs',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
];
await Promise.all(
  configs.map(async (config) => (watch ? (await context(config)).watch() : build(config))),
);
