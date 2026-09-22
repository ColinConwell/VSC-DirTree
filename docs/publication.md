# Programmatic Publication

The publication scripts build and verify one VSIX for Visual Studio Marketplace and Open VSX. Dry run is the default. They do not create publishers or namespaces, accept agreements, change repository visibility, increment versions, or create Git tags or GitHub releases.

## Configuration

Use Node.js 22 or later and run `npm ci`. The scripts read `.env.local` as data, without evaluating shell commands. Existing environment variables take precedence, so the same scripts work with CI secrets. The file is excluded from Git, Docker contexts, and the VSIX.

| Variable                                                    | Purpose                                                                                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OVSX_PAT`                                                  | Open VSX personal access token with permission to publish in the manifest's namespace.                                                                                                        |
| `VSCE_PAT`                                                  | Azure DevOps personal access token with Marketplace **Manage** scope, associated with a user who can publish under the manifest's publisher.                                                  |
| `VSCE_AUTH`                                                 | `pat` (default) or `azure` to use VSCE's Microsoft Entra credential chain instead of a PAT.                                                                                                   |
| `VSCE_PUBLISHER_ID`                                         | Optional Marketplace publisher UUID for comparison with returned metadata. This is an identifier, not an authentication credential. The legacy spelling `VCSE_PUBLISHER_ID` is also accepted. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Optional Entra service-principal configuration when using `VSCE_AUTH=azure`. An existing Azure CLI login or supported managed identity can also be used by VSCE.                              |

The publisher name comes from `package.json` (`ColinConwell`); its UUID is never substituted for the publisher name or token. Entra mode ignores `VSCE_PAT`. Authorize the Entra identity as a publisher member before using it. See [Microsoft's publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for current authentication requirements, including the planned December 1, 2026 retirement of global Azure DevOps PATs, and [Open VSX's guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions) for its account and agreement requirements.

## Read-Only Metadata and Credential Checks

```sh
npm run release:metadata
npm run release:metadata -- --registry openvsx
npm run release:metadata -- --registry marketplace
```

The JSON report includes local identity and version, namespace/publisher metadata, credential-check results, current registry versions, duplicate-version checks, and public source availability. Missing listings are normal for an initial release. Missing credentials, namespaces, inaccessible metadata, duplicate versions, or inaccessible public source are reported as preflight blockers.

Open VSX checks use the official authenticated `GET /api/{namespace}/verify-pat` endpoint. Marketplace checks use `vsce verify-pat` with the token in the child environment, or `--azure-credential`, and fetch publisher metadata (authenticated when using a PAT). Public extension and source queries do not need credentials. The Marketplace search endpoint uses a read-only POST query; it does not upload anything.

`vsce verify-pat` verifies publisher access but can also succeed for a Reader role. A dry run cannot prove that the token has Marketplace Manage scope, that the caller has upload permission, or that the registries' upload-time scans and review will accept the package. A missing Open VSX namespace also prevents establishing publishing access with its namespace-specific verification endpoint.

## Dry Runs

```sh
# Complete local validation, package, and authenticated registry preflight:
npm run release:dry-run

# Inspect one registry:
npm run release:dry-run -- --registry openvsx

# Faster packaging and registry preflight; does not run the full test suite:
npm run release:dry-run -- --skip-tests

# Local package validation without registry requests or credential checks:
npm run release:dry-run -- --offline --skip-tests
```

A full dry run executes formatting and type checks, core tests, publication safety tests, a production build, browser UI and web workbench tests, package verification, and installation tests against the VSIX. It then performs registry preflight and prints the VSIX size, SHA-256, and intended upload commands. No publish command is invoked. The package itself is rebuilt locally; a dry run is not a no-write operation on the filesystem.

Install the Chromium test browser with `npx playwright install chromium` first. On Linux, use `npx playwright install --with-deps chromium` and run the full workflow under `xvfb-run -a`. `VSCODE_EXECUTABLE` selects an existing compatible editor for installation testing; otherwise the test runner downloads its pinned VS Code version. See [Development and Testing](development.md).

Exit codes are `0` for successful checks (or an explicitly offline local-only run), `2` when online preflight completes with blockers, and `1` for a validation or execution failure. An offline run always reports `ready: false`: it does not establish publication readiness.

## Uploads and Subsequent Versions

These commands perform real uploads and should only be run when publication is intended:

```sh
npm run release:publish
npm run release:publish -- --registry marketplace
npm run release:publish -- --registry openvsx
```

Publishing always runs the full local validation and online preflight. Both registries must pass preflight before either upload when selecting `all`. The scripts upload the same verified VSIX with the official installed CLIs, check its hash before each upload, and query registry visibility afterward. A successful upload can precede search indexing or review; the report distinguishes acceptance from visible availability. Rerun `release:metadata` to check later.

The two registries do not provide a shared transaction. If one upload succeeds and the other fails, inspect metadata and retry with only the missing registry. Successful uploads are not automatically undone, and existing versions are never overwritten or silently skipped. Both registries default to the version in `package.json`; update it and the lockfile together, for example with `npm version patch --no-git-tag-version`, and update `CHANGELOG.md` before validating a new release.

Tokens are never passed in command-line arguments or printed in reports. Subprocess output is redacted, registry hosts are fixed to their official endpoints, and credential-bearing HTTP requests do not follow redirects. Local build/test subprocesses do not receive the configured publishing credentials. Open VSX's API places its token in the HTTPS query string, as its official CLI does; avoid logging raw request URLs.

## Testing the Publication Workflow

```sh
npm run test:release
```

These tests simulate registry responses and upload commands. They cover the default dry run, option conflicts, missing credentials, permission and metadata failures, duplicates, private source, local validation failures, single-registry recovery, partial upload failure, environment handling, and token redaction. They never load real `.env.local` credentials or contact registries. CI runs them without publishing secrets. Real credential checks require `release:metadata` or an online dry run.
