import { runTests } from '@vscode/test-electron';
import { resolve } from 'node:path';
await runTests({
  version: '1.138.0',
  ...(process.env.VSCODE_EXECUTABLE ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE } : {}),
  extensionDevelopmentPath: resolve(process.env.DIRTREE_INSTALLED_PATH || '.'),
  extensionTestsPath: resolve('dist/test/extension.test.cjs'),
  launchArgs: [
    resolve('fixtures/workspace'),
    '--user-data-dir=' + resolve('.test-profile/desktop'),
    '--extensions-dir=' + resolve('.test-profile/extensions'),
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
  ],
});
