import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs, parseEnv } from 'node:util';

export function options(args) {
  const { values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean' },
      publish: { type: 'boolean' },
      metadata: { type: 'boolean' },
      offline: { type: 'boolean' },
      'skip-tests': { type: 'boolean' },
      registry: { type: 'string', default: 'all' },
      help: { type: 'boolean' },
    },
  });
  if (!['all', 'marketplace', 'openvsx'].includes(values.registry))
    throw new Error('Registry must be all, marketplace, or openvsx.');
  if ([values['dry-run'], values.publish, values.metadata].filter(Boolean).length > 1)
    throw new Error('Choose only one of --dry-run, --publish, or --metadata.');
  if (values.publish && (values.offline || values['skip-tests']))
    throw new Error('Publishing requires online checks and the full test suite.');
  if (values.metadata && (values.offline || values['skip-tests']))
    throw new Error('Metadata mode requires online checks and does not run local tests.');
  return { ...values, mode: values.publish ? 'publish' : values.metadata ? 'metadata' : 'dry-run' };
}

const configKeys = [
  'OVSX_PAT',
  'VSCE_PAT',
  'VSCE_AUTH',
  'VSCE_PUBLISHER_ID',
  'VCSE_PUBLISHER_ID',
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
];
export async function configuration(environment = process.env, path = '.env.local') {
  let local = {};
  try {
    local = parseEnv(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to parse .env.local.');
  }
  const env = { ...environment };
  for (const key of configKeys)
    if (env[key] === undefined && local[key] !== undefined) env[key] = local[key];
  if (env.VSCE_AUTH && !['pat', 'azure'].includes(env.VSCE_AUTH))
    throw new Error('VSCE_AUTH must be pat or azure.');
  // Fixed official registry: local credentials must never follow a registry override.
  env.OVSX_REGISTRY_URL = 'https://open-vsx.org';
  delete env.VSCE_MARKETPLACE_URL;
  if (env.VSCE_AUTH === 'azure') delete env.VSCE_PAT;
  const secrets = [
    environment.VSCE_PAT,
    local.VSCE_PAT,
    env.OVSX_PAT,
    local.OVSX_PAT,
    env.AZURE_CLIENT_SECRET,
    local.AZURE_CLIENT_SECRET,
  ].filter(Boolean);
  const redact = (value) => {
    let text = String(value);
    for (const secret of secrets) {
      for (const form of [
        secret,
        encodeURIComponent(secret),
        Buffer.from(':' + secret).toString('base64'),
      ])
        text = text.split(form).join('[REDACTED]');
    }
    return text.replace(/([?&]token=)[^&\s"']+/gi, '$1[REDACTED]');
  };
  return { env, redact, publisherId: env.VSCE_PUBLISHER_ID || env.VCSE_PUBLISHER_ID };
}

export function runner(config) {
  return async (command, args, { credential = false, quiet = false } = {}) => {
    const env = { ...config.env };
    if (!credential) for (const key of configKeys) delete env[key];
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let output = '';
      const timer = setTimeout(() => child.kill(), 10 * 60 * 1000);
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (data) => {
          output += data;
        });
      child.on('error', () => {
        clearTimeout(timer);
        reject(new Error('Could not start ' + command));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const safe = config.redact(output);
        if (!quiet && safe) process.stdout.write(safe);
        resolve({ ok: code === 0, output: safe });
      });
    });
  };
}

export async function request(url, init = {}) {
  // Reject redirects rather than forwarding any credential to a different origin.
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      /* HTML sign-in pages are not metadata. */
    }
    return { status: response.status, data };
  } catch {
    return { status: 0, data: undefined };
  }
}

export async function inspect(manifest, config, selected, run, get = request) {
  const report = {
    extension: `${manifest.publisher}.${manifest.name}`,
    version: manifest.version,
    registries: {},
    blockers: [],
  };
  const block = (message) => report.blockers.push(message);
  const p = encodeURIComponent(manifest.publisher);
  const n = encodeURIComponent(manifest.name);
  const v = encodeURIComponent(manifest.version);
  const targets = selected === 'all' ? ['marketplace', 'openvsx'] : [selected];
  for (const target of targets) {
    const state = (report.registries[target] = {});
    if (target === 'openvsx') {
      if (config.env.OVSX_PAT) {
        const verification = await get(
          `https://open-vsx.org/api/${p}/verify-pat?token=${encodeURIComponent(config.env.OVSX_PAT)}`,
        );
        state.authentication =
          verification.status === 200 &&
          Boolean(verification.data?.success) &&
          !verification.data?.error
            ? 'verified'
            : 'failed';
        state.verification = config.redact(
          verification.data?.success || verification.data?.error || `HTTP ${verification.status}`,
        );
      } else state.authentication = 'missing OVSX_PAT';
      if (state.authentication !== 'verified')
        block(
          'Open VSX: ' +
            state.authentication +
            (state.verification ? ' (' + state.verification + ')' : ''),
        );
      const namespace = await get(`https://open-vsx.org/api/${p}`);
      state.namespace =
        namespace.status === 200
          ? {
              name: namespace.data?.name,
              access: namespace.data?.access,
              extensions: Object.keys(namespace.data?.extensions || {}),
            }
          : { status: namespace.status };
      if (namespace.status !== 200)
        block(`Open VSX: namespace metadata unavailable (HTTP ${namespace.status}).`);
      const latest = await get(`https://open-vsx.org/api/${p}/${n}`);
      state.listing =
        latest.status === 404
          ? 'not published'
          : latest.status === 200 && latest.data?.version
            ? {
                version: latest.data.version,
                downloads: latest.data.downloadCount,
                verified: latest.data.verified,
                publishedBy: latest.data.publishedBy?.loginName,
              }
            : 'unavailable';
      const exact = await get(`https://open-vsx.org/api/${p}/${n}/${v}`);
      state.versionExists = exact.status === 200 && Boolean(exact.data?.version);
      if (state.versionExists)
        block(
          `Open VSX: version ${manifest.version} already exists; choose a new version or publish only to the other registry.`,
        );
      else if (exact.status !== 404)
        block(`Open VSX: could not rule out an existing version (HTTP ${exact.status}).`);
    } else {
      if (config.env.VSCE_PAT || config.env.VSCE_AUTH === 'azure') {
        const args = ['node_modules/@vscode/vsce/vsce', 'verify-pat', manifest.publisher];
        if (config.env.VSCE_AUTH === 'azure') args.push('--azure-credential');
        const verified = await run(process.execPath, args, { credential: true, quiet: true });
        state.authentication = verified.ok ? 'verified publisher access' : 'failed';
        state.verification = verified.output.trim();
        state.permissionLimit =
          'Read-only verification does not prove Marketplace Manage scope or upload permission; the registry checks these on upload.';
      } else state.authentication = 'missing VSCE_PAT or VSCE_AUTH=azure';
      if (!state.authentication.startsWith('verified'))
        block('Marketplace: ' + state.authentication);
      const headers = config.env.VSCE_PAT
        ? { Authorization: 'Basic ' + Buffer.from(':' + config.env.VSCE_PAT).toString('base64') }
        : {};
      let publisher;
      if (config.env.VSCE_AUTH === 'azure') {
        const metadata = await run(
          process.execPath,
          ['scripts/marketplace-publisher.mjs', manifest.publisher],
          { credential: true, quiet: true },
        );
        try {
          publisher = JSON.parse(metadata.output);
        } catch {
          publisher = { status: 0 };
        }
      } else {
        publisher = await get(
          `https://marketplace.visualstudio.com/_apis/gallery/publishers/${p}?api-version=7.2-preview.1`,
          { headers },
        );
      }
      state.publisher =
        publisher.status === 200 && publisher.data?.publisherName
          ? {
              name: publisher.data.publisherName,
              displayName: publisher.data.displayName,
              configuredIdMatches: config.publisherId
                ? publisher.data.publisherId?.toLowerCase() === config.publisherId.toLowerCase()
                : null,
            }
          : { status: publisher.status };
      if (state.publisher.configuredIdMatches === false)
        block('Marketplace: configured publisher UUID does not match the manifest publisher.');
      if (!state.publisher.name)
        block(`Marketplace: publisher metadata unavailable (HTTP ${publisher.status}).`);
      // The gallery search API uses POST for a read-only query; it never uploads an extension.
      const listing = await get(
        'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json;api-version=3.0-preview.1',
          },
          body: JSON.stringify({
            filters: [
              {
                criteria: [{ filterType: 7, value: report.extension }],
                pageNumber: 1,
                pageSize: 1,
              },
            ],
            flags: 1,
          }),
        },
      );
      const extensions = listing.data?.results?.[0]?.extensions;
      if (listing.status !== 200 || !Array.isArray(extensions)) {
        state.listing = 'unavailable';
        block(`Marketplace: extension metadata unavailable (HTTP ${listing.status}).`);
      } else {
        const extension = extensions.find(
          (item) =>
            `${item.publisher.publisherName}.${item.extensionName}`.toLowerCase() ===
            report.extension.toLowerCase(),
        );
        state.listing = extension
          ? { versions: extension.versions?.map((item) => item.version) || [] }
          : 'not published';
        state.versionExists =
          extension?.versions?.some((item) => item.version === manifest.version) || false;
        if (state.versionExists)
          block(
            `Marketplace: version ${manifest.version} already exists; choose a new version or publish only to the other registry.`,
          );
      }
    }
  }
  const source = await get('https://api.github.com/repos/ColinConwell/VSC-DirTree');
  report.publicSource = source.status === 200 && source.data?.private === false;
  if (!report.publicSource)
    block('The linked GitHub source and documentation are not publicly accessible.');
  report.ready = report.blockers.length === 0;
  return report;
}

export async function release(opts, config, dependencies = {}) {
  const manifest = dependencies.manifest || JSON.parse(await readFile('package.json', 'utf8'));
  const run = dependencies.run || runner(config);
  const log = dependencies.log || console.log;
  const checked = async (command, args) => {
    log('Run: ' + [command, ...args].join(' '));
    const result = await run(command, args);
    if (!result.ok) throw new Error('Local validation failed: ' + args.join(' '));
  };
  const npm = (script) => {
    const cli = process.env.npm_execpath || dependencies.npmCli;
    if (!cli)
      throw new Error(
        'Run this workflow through npm run release:dry-run or npm run release:publish.',
      );
    return checked(process.execPath, [cli, 'run', script]);
  };
  if (opts.mode !== 'metadata') {
    if (!opts['skip-tests']) {
      for (const script of [
        'format:check',
        'check',
        'test',
        'test:release',
        'build',
        'test:ui',
        'test:workbench',
      ])
        await npm(script);
    }
    await npm('package');
    if (!opts['skip-tests']) await npm('test:installed');
  }
  const report = opts.offline
    ? {
        ready: false,
        offline: true,
        blockers: ['Online registry and credential checks were skipped.'],
      }
    : await inspect(manifest, config, opts.registry, run, dependencies.request);
  if (opts.mode !== 'metadata') {
    const content = dependencies.artifact || (await readFile('dirtree.vsix'));
    report.artifact = {
      path: 'dirtree.vsix',
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }
  report.localValidation =
    opts.mode === 'metadata' ? 'not run' : opts['skip-tests'] ? 'package only' : 'full';
  const targets = opts.registry === 'all' ? ['marketplace', 'openvsx'] : [opts.registry];
  const uploadArgs = (target) => {
    const args =
      target === 'marketplace'
        ? ['node_modules/@vscode/vsce/vsce', 'publish', '--packagePath', 'dirtree.vsix']
        : ['node_modules/ovsx/bin/ovsx', 'publish', 'dirtree.vsix'];
    if (target === 'marketplace' && config.env.VSCE_AUTH === 'azure')
      args.push('--azure-credential');
    return args;
  };
  report.uploadPlan = targets.map((target) => ({
    registry: target,
    command: ['node', ...uploadArgs(target)].join(' '),
  }));
  log(config.redact(JSON.stringify({ mode: opts.mode, ...report }, null, 2)));
  if (opts.mode !== 'publish') {
    log('No upload commands executed. No namespaces, releases, or versions created.');
    return opts.offline || report.ready ? 0 : 2;
  }
  if (!report.ready)
    throw new Error('Publication blocked by preflight checks; no uploads attempted.');
  for (const target of targets) {
    // Re-check the artifact before each upload; both registries receive identical bytes.
    const content = dependencies.artifact || (await readFile('dirtree.vsix'));
    if (createHash('sha256').update(content).digest('hex') !== report.artifact.sha256)
      throw new Error('Release artifact changed after validation.');
    log('Uploading verified artifact to ' + target + '.');
    const result = await run(process.execPath, uploadArgs(target), { credential: true });
    if (!result.ok)
      throw new Error(
        `Upload to ${target} failed. Earlier successful uploads are not rolled back. Inspect metadata before retrying a single registry.`,
      );
    log('Registry accepted upload to ' + target + '; indexing and review may still be pending.');
  }
  const after = await inspect(manifest, config, opts.registry, run, dependencies.request);
  log(
    config.redact(
      JSON.stringify(
        {
          uploadAccepted: true,
          visibility: Object.fromEntries(
            targets.map((target) => [
              target,
              after.registries[target].versionExists
                ? 'version visible'
                : 'not yet confirmed; rerun release:metadata',
            ]),
          ),
        },
        null,
        2,
      ),
    ),
  );
  return 0;
}
