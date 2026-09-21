# DirTree

A compact VS Code / Code OSS sidebar for building directory trees and copying them into documents. The tree is a draft: editing it does not create, rename, or delete files in your workspace.

## First Run

Install the generated `dirtree.vsix` with **Extensions → … → Install from VSIX…**, then select **DirTree** in the Activity Bar. You can also run **DirTree: Open Tree Builder** from the Command Palette.

- Select a folder and add a **File** or **Folder**. When a file is selected, new items go beside it.
- Type the name inline. **Enter** commits; **Escape** cancels. Double-click or **F2** renames an existing item.
- Drag between rows to reorder, or onto a folder to nest. Hovering over a collapsed folder during a drag expands it.
- Use the row’s **…** menu for comments, moving, and deletion. Undo restores deleted subtrees.
- Click **Copy Tree** for plain text, or its dropdown for a fenced Markdown block.
- Expand **Text Preview** to inspect or manually select the output. Collapsing folders does not exclude their children from exports.

The draft saves automatically per workspace. Without an open workspace, DirTree uses a separate shared draft. Selection, expansion, preview visibility, and in-progress input are restored when VS Code retains the webview state; committed tree data survives a VS Code restart. Undo history is bounded to 100 edits and is not guaranteed across application restarts.

```text
project/
├── src/
│   ├── index.ts
│   └── helpers.ts
└── README.md
```

## Keyboard Controls

Tree shortcuts apply while a tree row has focus. Text inputs retain normal text-editing shortcuts.

| Action | Shortcut |
| --- | --- |
| Add file / folder | N / Shift+N |
| Rename | F2 or Enter |
| Commit / cancel editing | Enter / Escape |
| Navigate | Up / Down / Home / End |
| Expand / collapse / navigate hierarchy | Right / Left |
| Move up / down | Alt+Up / Alt+Down |
| Nest under preceding folder / outdent | Alt+Right / Alt+Left |
| Item actions | Shift+F10 |
| Delete | Delete or Backspace |
| Undo / redo | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z |
| Copy plain text / Markdown | Cmd/Ctrl+C / Cmd/Ctrl+Shift+C |
| Show shortcuts | ? |

Tab remains available for moving between controls. Keyboard alternatives cover all drag operations.

## Development

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

## License

GPL-3.0-only. See [LICENSE](LICENSE).
