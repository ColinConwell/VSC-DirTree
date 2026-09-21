import { open } from '@vscode/test-web';
import { resolve } from 'node:path';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const server = await open({
  browserType: 'none',
  quality: 'stable',
  commit: process.env.VSCODE_COMMIT || '7debcd0e2acdea1c52de81bf9ee1620444407dda',
  extensionDevelopmentPath: resolve('.'),
  folderPath: resolve('fixtures/workspace'),
  host,
  port,
  testRunnerDataDir: process.env.DIRTREE_TEST_CACHE || resolve('.vscode-test-web'),
});
console.log(`DirTree sandbox: http://localhost:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.dispose();
    process.exit(0);
  });
