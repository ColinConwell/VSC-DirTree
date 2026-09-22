import { configuration, options, release } from './lib/publication.mjs';
let redact = () => 'Publication command failed before credentials could be loaded.';
try {
  const config = await configuration();
  redact = config.redact;
  const opts = options(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'DirTree publication: --dry-run (default) | --metadata | --publish\nOptions: --registry all|marketplace|openvsx, --offline (dry run only), --skip-tests (dry run only).\n.env.local is parsed as data; process environment takes precedence. See docs/publication.md.',
    );
  } else process.exitCode = await release(opts, config);
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
}
