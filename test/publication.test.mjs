import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, inspect, options, release, runner } from '../scripts/lib/publication.mjs';

const manifest = { publisher: 'ColinConwell', name: 'vsc-dirtree', version: '0.1.0' };
const config = {
  env: { VSCE_PAT: 'test-market-token', OVSX_PAT: 'test-open-token' },
  redact: String,
};
function harness(override) {
  const commands = [],
    requests = [],
    logs = [];
  const deps = {
    npmCli: 'npm-cli.js',
    manifest,
    artifact: Buffer.from('test VSIX'),
    log: (message) => logs.push(message),
    run: async (command, args, opts) => {
      commands.push({ command, args, opts });
      return { ok: true, output: 'verified' };
    },
    request: async (url, init = {}) => {
      requests.push({ url, init });
      const custom = override?.(url, init);
      if (custom) return custom;
      if (url.includes('/verify-pat?'))
        return { status: 200, data: { success: 'Token may publish' } };
      if (url === 'https://open-vsx.org/api/ColinConwell')
        return { status: 200, data: { name: 'ColinConwell', extensions: {} } };
      if (url.includes('/gallery/publishers/'))
        return {
          status: 200,
          data: {
            publisherName: 'colinconwell',
            displayName: 'Colin Conwell',
            publisherId: 'test-id',
          },
        };
      if (url.endsWith('/extensionquery'))
        return { status: 200, data: { results: [{ extensions: [] }] } };
      if (url.includes('api.github.com')) return { status: 200, data: { private: false } };
      return { status: 404, data: { error: 'Not found' } };
    },
  };
  return {
    deps,
    commands,
    requests,
    logs,
    uploads: () => commands.filter(({ args }) => args.includes('publish')),
  };
}

test('default is dry run; ambiguous and unsafe flag combinations fail closed', () => {
  assert.equal(options([]).mode, 'dry-run');
  for (const args of [
    ['--dry-run', '--publish'],
    ['--metadata', '--publish'],
    ['--publish', '--offline'],
    ['--publish', '--skip-tests'],
    ['--registry', 'unknown'],
    ['--publsh'],
  ])
    assert.throws(() => options(args));
});

test('full dry run validates and queries both registries but cannot upload', async () => {
  const h = harness();
  assert.equal(await release(options(['--dry-run']), config, h.deps), 0);
  assert.deepEqual(
    h.commands.filter((c) => c.args.includes('run')).map((c) => c.args.at(-1)),
    [
      'format:check',
      'check',
      'test',
      'test:release',
      'build',
      'test:ui',
      'test:workbench',
      'package',
      'test:installed',
    ],
  );
  assert.equal(h.uploads().length, 0);
  assert.ok(h.commands.some((c) => c.args.includes('verify-pat')));
  assert.ok(h.requests.some((r) => r.url.includes('/verify-pat?token=')));
  assert.deepEqual(
    h.requests.filter((r) => r.init.method && r.init.method !== 'GET').map((r) => r.url),
    ['https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery'],
  );
  assert.ok(h.logs.some((log) => log.includes('sha256')));
});

test('offline dry run performs no registry or credential requests', async () => {
  const h = harness();
  assert.equal(await release(options(['--offline', '--skip-tests']), config, h.deps), 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.uploads().length, 0);
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].args.at(-1), 'package');
});

test('metadata is read-only and works without a built artifact', async () => {
  const h = harness();
  delete h.deps.artifact;
  assert.equal(await release(options(['--metadata']), config, h.deps), 0);
  assert.equal(h.uploads().length, 0);
  assert.equal(h.commands.length, 1);
  assert.ok(h.commands[0].args.includes('verify-pat'));
});

test('missing credentials return a non-success dry-run result without prompting', async () => {
  const h = harness();
  assert.equal(
    await release(options(['--dry-run', '--skip-tests']), { env: {}, redact: String }, h.deps),
    2,
  );
  assert.equal(h.commands.length, 1);
  assert.equal(h.uploads().length, 0);
});

test('failed token, namespace, source, metadata, or duplicate checks prevent every upload', async () => {
  const cases = [
    (url) =>
      url.includes('/verify-pat?') && { status: 403, data: { error: 'No publishing access' } },
    (url) => url === 'https://open-vsx.org/api/ColinConwell' && { status: 404 },
    (url) => url.includes('api.github.com') && { status: 404 },
    (url) => url.endsWith('/extensionquery') && { status: 503 },
    (url) => url.endsWith('/vsc-dirtree/0.1.0') && { status: 200, data: { version: '0.1.0' } },
    (url) => url.endsWith('/vsc-dirtree/0.1.0') && { status: 503 },
    (url) =>
      url.endsWith('/extensionquery') && {
        status: 200,
        data: {
          results: [
            {
              extensions: [
                {
                  publisher: { publisherName: 'ColinConwell' },
                  extensionName: 'vsc-dirtree',
                  versions: [{ version: '0.1.0' }],
                },
              ],
            },
          ],
        },
      },
  ];
  for (const behavior of cases) {
    const h = harness(behavior);
    await assert.rejects(release(options(['--publish']), config, h.deps), /no uploads attempted/);
    assert.equal(h.uploads().length, 0);
  }
});

test('local test failure stops before any network checks or upload', async () => {
  const h = harness();
  h.deps.run = async () => ({ ok: false });
  await assert.rejects(release(options(['--publish']), config, h.deps), /Local validation failed/);
  assert.equal(h.requests.length, 0);
});

test('publisher UUID is compared with metadata, never treated as a token', async () => {
  const h = harness();
  const report = await inspect(
    manifest,
    { env: {}, publisherId: 'wrong-id', redact: String },
    'marketplace',
    h.deps.run,
    h.deps.request,
  );
  assert.equal(report.ready, false);
  assert.ok(report.blockers.some((item) => item.includes('UUID')));
  assert.equal(h.commands.length, 0);
});

test('explicit publication uploads the same artifact to both registries after checks', async () => {
  const h = harness();
  assert.equal(await release(options(['--publish']), config, h.deps), 0);
  assert.equal(h.uploads().length, 2);
  for (const upload of h.uploads()) {
    assert.ok(upload.args.includes('dirtree.vsix'));
    assert.equal(upload.opts.credential, true);
    assert.ok(
      !upload.args.some(
        (arg) => arg.includes('test-market-token') || arg.includes('test-open-token'),
      ),
    );
  }
});

test('single-registry recovery avoids duplicate uploads to the other registry', async () => {
  const h = harness();
  assert.equal(await release(options(['--publish', '--registry', 'openvsx']), config, h.deps), 0);
  assert.equal(h.uploads().length, 1);
  assert.ok(h.uploads()[0].args[0].includes('ovsx'));
  assert.ok(!h.requests.some((r) => r.url.includes('marketplace.visualstudio.com')));
});

test('a failed first upload stops the second and reports partial-publication semantics', async () => {
  const h = harness();
  const run = h.deps.run;
  h.deps.run = async (...args) => {
    const result = await run(...args);
    return { ...result, ok: !args[1].includes('publish') };
  };
  await assert.rejects(release(options(['--publish']), config, h.deps), /not rolled back/);
  assert.equal(h.uploads().length, 1);
});

test('environment loading is data-only, preserves overrides, handles legacy key, and redacts secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dirtree-publication-'));
  try {
    const path = join(dir, '.env.local');
    await writeFile(
      path,
      'OVSX_PAT="local-token"\nVSCE_PAT="other-secret"\nVCSE_PUBLISHER_ID=example-id\nNODE_OPTIONS=--bad-option\nOVSX_REGISTRY_URL=https://example.invalid\n',
    );
    const loaded = await configuration(
      { OVSX_PAT: 'ci-token', VSCE_MARKETPLACE_URL: 'https://example.invalid' },
      path,
    );
    assert.equal(loaded.env.OVSX_PAT, 'ci-token');
    assert.equal(loaded.publisherId, 'example-id');
    assert.equal(loaded.env.NODE_OPTIONS, undefined);
    assert.equal(loaded.env.VSCE_MARKETPLACE_URL, undefined);
    assert.equal(loaded.env.OVSX_REGISTRY_URL, 'https://open-vsx.org');
    assert.ok(
      !loaded
        .redact('ci-token other-secret ' + Buffer.from(':other-secret').toString('base64'))
        .includes('secret'),
    );
    const result = await runner(loaded)(
      process.execPath,
      ['-e', 'process.stdout.write(String(process.env.OVSX_PAT))'],
      { quiet: true },
    );
    assert.equal(result.output, 'undefined');
    const credentialResult = await runner(loaded)(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.OVSX_PAT)'],
      { credential: true, quiet: true },
    );
    assert.equal(credentialResult.output, '[REDACTED]');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Entra metadata authenticates against the fixed marketplace and never returns the token', async () => {
  const { azurePublisher } = await import('../scripts/marketplace-publisher.mjs');
  const result = await azurePublisher(
    'ColinConwell',
    async () => 'temporary-test-access-token',
    async (url, init) => {
      assert.equal(new URL(url).origin, 'https://marketplace.visualstudio.com');
      assert.equal(
        init.headers.Authorization,
        'Basic ' + Buffer.from('OAuth:temporary-test-access-token').toString('base64'),
      );
      return {
        status: 200,
        data: { publisherName: 'colinconwell', publisherId: 'id', extra: 'not emitted' },
      };
    },
  );
  assert.equal(result.data.publisherName, 'colinconwell');
  assert.equal(result.data.extra, undefined);
  assert.ok(!JSON.stringify(result).includes('temporary-test-access-token'));
  assert.deepEqual(
    await azurePublisher('ColinConwell', async () => {
      throw new Error('temporary-test-access-token');
    }),
    { status: 0 },
  );
});

test('Entra mode uses authenticated publisher metadata and the Azure upload option', async () => {
  const h = harness();
  const original = h.deps.run;
  h.deps.run = async (...args) => {
    const result = await original(...args);
    if (args[1][0] === 'scripts/marketplace-publisher.mjs')
      return {
        ok: true,
        output: JSON.stringify({
          status: 200,
          data: { publisherName: 'ColinConwell', publisherId: 'id' },
        }),
      };
    return result;
  };
  assert.equal(
    await release(
      options(['--publish', '--registry', 'marketplace']),
      { env: { VSCE_AUTH: 'azure' }, redact: String },
      h.deps,
    ),
    0,
  );
  assert.ok(h.uploads()[0].args.includes('--azure-credential'));
  assert.ok(
    h.commands.find((c) => c.args.includes('verify-pat')).args.includes('--azure-credential'),
  );
});
