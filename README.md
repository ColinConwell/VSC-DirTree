# DirTree

Build directory trees in your editor's sidebar and copy them as plain text or fenced Markdown. DirTree edits a draft for documentation; it does not create, rename, or delete workspace files.

```text
project/
├── src/
│   ├── index.ts
│   └── helpers.ts
└── README.md
```

## Features

- Add, rename, reorder, nest, and delete files and folders using the mouse or keyboard.
- Drag items between folders, with automatic expansion on hover.
- Add inline comments and inspect the text preview before copying.
- Copy the complete tree as plain text or a Markdown code block, including collapsed branches.
- Undo and redo up to 100 edits, and automatically save a draft per workspace.
- Use your editor's light, dark, or high-contrast theme.

## Installation

DirTree requires VS Code 1.96 or later, or an editor with a compatible VS Code extension API. It includes both desktop and browser extension hosts. Node.js is not required to use the installed extension.

### VS Code, Cursor, and Compatible Editors

In the Extensions view, search for `ColinConwell.vsc-dirtree` and verify that the developer is **Colin Conwell**. Marketplace installation is available once the extension has been published to your editor's registry: Visual Studio Marketplace for VS Code, and Open VSX for Cursor and other clients that use that registry. Availability can depend on the editor's review and organizational policies.

### Install From a VSIX

Download `dirtree.vsix` from a [GitHub release](https://github.com/ColinConwell/VSC-DirTree/releases), when available, or [build it from source](docs/development.md). In the Extensions view, open **… → Install from VSIX…** and select the file.

With the corresponding editor's command-line launcher installed:

```sh
code --install-extension dirtree.vsix
# Or, for Cursor:
cursor --install-extension dirtree.vsix
```

## Quick Start

1. Select **DirTree** in the Activity Bar, or run **DirTree: Open Tree Builder** from the Command Palette.
2. Select a folder and choose **File** or **Folder**. When a file is selected, new items go beside it.
3. Enter a name. Press **Enter** to save it or **Escape** to cancel. Double-click an item or press **F2** to rename it.
4. Drag between rows to reorder, or onto a folder to nest. The row's **…** menu also provides comments, movement, and deletion.
5. Select **Copy Tree** for plain text, or open its dropdown and choose **Copy as Markdown**. Paste the result into your document.

Expand **Text Preview** to inspect or manually select the output. Collapsing a folder only changes the sidebar; its children remain in the export.

## Commands

Open the Command Palette with **Cmd+Shift+P** on macOS or **Ctrl+Shift+P** on Windows and Linux.

| Command                        | Action                                                |
| ------------------------------ | ----------------------------------------------------- |
| DirTree: Open Tree Builder     | Open the sidebar.                                     |
| DirTree: Copy Tree             | Copy the current draft as plain text.                 |
| DirTree: Copy Tree as Markdown | Copy the current draft in a fenced `text` code block. |

DirTree does not require configuration settings.

## Keyboard Shortcuts

These shortcuts apply while a tree row has focus. Text inputs retain normal text-editing shortcuts. Use **Cmd** on macOS and **Ctrl** on Windows and Linux where indicated.

| Action                                 | Shortcut                      |
| -------------------------------------- | ----------------------------- |
| Add file / folder                      | N / Shift+N                   |
| Rename                                 | F2 or Enter                   |
| Save / cancel editing                  | Enter / Escape                |
| Navigate                               | Up / Down / Home / End        |
| Expand / collapse / navigate hierarchy | Right / Left                  |
| Move up / down                         | Alt+Up / Alt+Down             |
| Nest under preceding folder / outdent  | Alt+Right / Alt+Left          |
| Item actions                           | Shift+F10                     |
| Delete                                 | Delete or Backspace           |
| Undo / redo                            | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z |
| Copy plain text / Markdown             | Cmd/Ctrl+C / Cmd/Ctrl+Shift+C |
| Show shortcuts                         | ?                             |

Tab moves between controls. Keyboard alternatives are available for all drag operations.

## Saved Drafts and Privacy

Committed edits are saved automatically in the editor's extension storage, with one draft per workspace. Without an open workspace, DirTree uses a separate draft in that editor profile. Committed tree data survives restarts; undo history and unfinished input are not guaranteed to survive a restart. Removing an editor profile or its extension storage can remove its drafts. Copy important trees into a document to retain them independently.

DirTree does not scan or modify workspace files, send telemetry, or make network requests. All runtime assets are included in the extension. The editor handles clipboard access and extension storage. In browser editors, clipboard access may require browser permission. Virtual and untrusted workspaces are supported because the extension edits only its own draft.

## Limitations and Troubleshooting

- Names must be single path segments and unique within their parent. Folder slashes are added when rendering.
- A tree supports up to 5,000 items and 64 nested levels. Comments are single-line text. Wide or combining Unicode characters may affect comment alignment.
- This version supports one draft per workspace. It does not import the filesystem, insert directly into documents, or manage multiple saved trees.
- If the sidebar is hidden, run **DirTree: Open Tree Builder**. After an installation or update, try **Developer: Reload Window** if the view is unavailable.
- If browser clipboard access is denied, allow it for the editor's site or manually select the output in **Text Preview**.

## Support and Development

Report reproducible problems through [GitHub Issues](https://github.com/ColinConwell/VSC-DirTree/issues). Include the editor version, operating system, steps to reproduce, and expected result. Avoid including private paths or document contents.

See [Development and Testing](docs/development.md) for the source layout, local workbench, test commands, and package verification. See the [Changelog](CHANGELOG.md) for version history and [Contributing](CONTRIBUTING.md) for contribution guidance.

## Author and License

Developed by **Colin Conwell** ([colinconwell@gmail.com](mailto:colinconwell@gmail.com)).

Copyright © 2026 Colin Conwell. Licensed under [GPL-3.0-only](LICENSE). Bundled third-party licenses are included in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). Corresponding source and build instructions are available in the [source repository](https://github.com/ColinConwell/VSC-DirTree).
