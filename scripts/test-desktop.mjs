import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const packaged = process.argv.includes('--package');
const version = process.env.VSCODE_VERSION || '1.138.0';
const executable = process.env.VSCODE_EXECUTABLE || (await downloadAndUnzipVSCode(version));
await mkdir('.test-profile', { recursive: true });
const profile = await mkdtemp(resolve('.test-profile/dirtree-'));
const profileArgs = [
  '--user-data-dir=' + join(profile, 'user'),
  '--extensions-dir=' + join(profile, 'extensions'),
];
try {
  let extensionPath = resolve('.');
  if (packaged) {
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable, {
      reuseMachineInstall: true,
    });
    const result = spawnSync(
      cli,
      [...args, ...profileArgs, '--install-extension', resolve('dirtree.vsix'), '--force'],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`DirTree VSIX installation failed (${result.status}).`);
    const names = await readdir(join(profile, 'extensions'));
    const installed = names.filter((name) =>
      name.toLowerCase().startsWith('colinconwell.vsc-dirtree-'),
    );
    if (installed.length !== 1)
      throw new Error('Expected exactly one installed DirTree extension.');
    extensionPath = join(profile, 'extensions', installed[0]);
    console.log('Testing installed DirTree package: ' + extensionPath);
  }
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: extensionPath,
    extensionTestsPath: resolve('dist/test/extension.test.cjs'),
    extensionTestsEnv: { DIRTREE_EXPECTED_PATH: extensionPath },
    launchArgs: [
      resolve('fixtures/workspace'),
      ...profileArgs,
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ],
  });
} finally {
  await rm(profile, { recursive: true, force: true });
}
