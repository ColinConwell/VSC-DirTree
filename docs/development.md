# Development and Testing

Use Node.js 22 or later and npm.

```sh
npm ci
npm run build
npm run dev
```

Open **http://localhost:3000** in a Chromium-based browser. This is Microsoft's real VS Code web workbench, served by `@vscode/test-web`, with DirTree loaded and a small sample workspace. **Use `localhost`**: the workbench constructs subdomains for isolated extension workers and webviews, which do not work with an IPv4 address in the URL.

The first launch downloads a pinned VS Code build into `.vscode-test-web/`. The sample filesystem is virtual: changes to its documents remain in memory. DirTree drafts use the workbench’s browser storage. Browser clipboard access may require permission.

For UI development, run `npm run watch` in another terminal and reload the workbench after rebuilding. `npm run dev:ui` provides a faster standalone sidebar harness at `http://127.0.0.1:4317`; its clipboard bridge is simulated, so use the workbench or desktop tests to verify actual copying.

For desktop development, open this repository in VS Code and press **F5**, selecting **DirTree Extension**. This opens an Extension Development Host on the sample workspace.

## Container Sandbox

```sh
docker compose up --build
```

Open **http://localhost:3000**. The container serves the real VS Code web workbench; your host browser displays it. It does not require a Linux desktop or VNC. The port is bound to the host’s loopback interface. A Docker volume caches the downloaded workbench. Stop it with `docker compose down`.

The container runs a built snapshot. After source changes, rebuild it with the same command. To choose another host port, run `DIRTREE_PORT=3001 docker compose up --build`. Stop a locally running `npm run dev` before starting the container on the same port.

## Verification and Packaging

```sh
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:workbench
npm run test:desktop
npm run package
npm run test:installed
```

- **Core tests:** branch formatting, Markdown fences, name validation, nesting, cycles, deletion, undo, and persisted-data validation.
- **UI tests:** inline editing and focus, copy requests, drag/drop, keyboard movement, comments, narrow layouts, and restoration.
- **Workbench test:** actual extension activation, actual clipboard contents, theme integration, hiding/reopening the sidebar, and page reload. It starts a separate workbench on `localhost:3002`.
- **Desktop tests:** extension activation, command registration, actual clipboard output, and opening the sidebar in an isolated profile.
- **Packaging:** creates `dirtree.vsix`, with bundled assets and no runtime npm dependencies.

To test an already running container, set `DIRTREE_WORKBENCH_URL=http://localhost:3000` when running `npm run test:workbench`. To save workbench screenshots, set `DIRTREE_SCREENSHOTS_DIR` to a directory outside the repository. On Linux CI, install Playwright system dependencies (`npx playwright install --with-deps chromium`) and run desktop tests under `xvfb-run -a`.

Desktop tests normally download VS Code 1.138.0. Set `VSCODE_EXECUTABLE` to an existing application executable to use that installation instead. Test profiles live under `.test-profile/`. `VSCODE_COMMIT` can override the pinned web build for compatibility testing.

## Implementation

- `src/core/tree.ts`: immutable tree operations, validation, undo/redo, and a deterministic text renderer.
- `src/webview/`: React sidebar, keyboard and drag interactions, native theme variables, and accessible tree semantics.
- `src/extension.ts`: `WebviewViewProvider`, workspace persistence, validated messages, and the VS Code clipboard API.
- `scripts/`: builds, development workbenches, and desktop test runner.

The extension activates on demand. UI changes happen locally; the extension host persists completed edits and handles clipboard access. All assets ship in the VSIX, with a restrictive content security policy. It works without network access after installation and uses the same source for desktop and browser extension hosts.

Names must be single path segments and unique within their parent. A trailing folder slash is added during rendering. One tree supports up to 5,000 items and 64 nested levels. Comments are single-line text; alignment assumes a monospace font, and wide or combining Unicode characters may not align precisely. The first version uses one draft per workspace. Document insertion, linked Markdown previews, filesystem import, and multiple saved trees are outside this version.

## Package Contents

`npm run package` performs a type check and clean production build, creates `dirtree.vsix`, and verifies the archive against an exact file allowlist. The VSIX contains only the extension manifest, README, changelog, GPL license, third-party notices, four runtime bundles, and two installed icons, plus the two VSIX metadata files. Source files, tests, fixtures, development tools, dependencies, caches, source maps, and screenshots are excluded. Keep those development and testing files in the source repository.

`npm run test:package` checks an existing VSIX, including its identity, entry points, browser capability, icon dimensions, license notices, and agreement with the current runtime build. Run it after `npm run build` if starting from a clean checkout.

`npm run test:installed` builds only the external test runner, installs the VSIX through the editor's CLI into a fresh isolated profile, and tests the installed extension directory. It checks identity, packaged resources, activation, commands, clipboard output, and sidebar opening. Profiles created by the runner are removed afterward; your normal editor profile is not used. The runner loads this installed directory as the extension under test in an Extension Development Host.

Set `VSCODE_VERSION=1.96.0` to test the minimum supported API or `VSCODE_VERSION=stable` to test the current stable editor. `VSCODE_EXECUTABLE` takes precedence and can point to a compatible editor's executable, including Cursor. `DIRTREE_EXTENSION_PATH` can point the web workbench at an extracted VSIX's `extension` directory for browser testing. CI tests the same packaged artifact on the pinned desktop version, the minimum supported version, and current stable.

## Icons and License Notices

`media/dirtree.svg` is the existing monochrome Activity Bar mark; the editor applies its theme color when displaying it. `media/icon.svg` is the editable marketplace icon source. Its opaque dark field and pale tree mark provide contrast on light and dark listing backgrounds. The 256 × 256 PNG is committed so ordinary builds do not need a browser.

After editing the marketplace icon, regenerate it with:

```sh
npx playwright install chromium
npm run build:icon
```

Production builds regenerate `THIRD_PARTY_NOTICES.txt` from the installed React, React DOM, and Scheduler licenses. Commit notice changes together with dependency updates. If another dependency is bundled, update the notice generator and package checks accordingly.

## Publication Tools

See [Programmatic Publication](publication.md) for credential configuration, read-only metadata checks, full and offline dry runs, explicit uploads, and publication workflow tests. Publishing credentials are not needed for ordinary builds or CI tests.
