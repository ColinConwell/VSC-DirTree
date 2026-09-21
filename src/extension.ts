import * as vscode from 'vscode';
import { assertTree, initialTree, renderTree, type TreeNode } from './core/tree';

const storageKey = 'dirtree.document.v1';
const viewKey = 'dirtree.view.v1';
interface ViewState {
  selected: string;
  collapsed: string[];
  preview: boolean;
  scroll: number;
}
function validView(value: unknown): value is ViewState {
  if (!value || typeof value !== 'object') return false;
  const state = value as ViewState;
  return (
    typeof state.selected === 'string' &&
    state.selected.length <= 128 &&
    Array.isArray(state.collapsed) &&
    state.collapsed.length <= 5000 &&
    state.collapsed.every((id) => typeof id === 'string' && id.length <= 128) &&
    typeof state.preview === 'boolean' &&
    Number.isFinite(state.scroll) &&
    state.scroll >= 0
  );
}
export function activate(context: vscode.ExtensionContext) {
  const storage = vscode.workspace.workspaceFolders?.length
    ? context.workspaceState
    : context.globalState;
  let tree = initialTree();
  const saved = storage.get<unknown>(storageKey);
  if (saved !== undefined) {
    try {
      assertTree(saved);
      tree = saved;
    } catch {
      void vscode.window.showWarningMessage(
        'DirTree could not restore the saved draft. The original data has been preserved until you make an edit.',
      );
    }
  }
  const storedView = storage.get<unknown>(viewKey);
  let viewState: ViewState | undefined = validView(storedView) ? storedView : undefined;
  let view: vscode.WebviewView | undefined;
  let writeQueue = Promise.resolve();
  const persist = (next: TreeNode) => {
    tree = next;
    const write = writeQueue.then(() => storage.update(storageKey, next));
    writeQueue = write.catch(() => undefined);
    return write;
  };
  const copy = async (markdown: boolean, current = tree) => {
    await vscode.env.clipboard.writeText(renderTree(current, markdown));
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dirtree.builder', {
      resolveWebviewView(webviewView) {
        view = webviewView;
        const webview = view.webview;
        webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
        };
        const script = webview.asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'),
        );
        const css = webview.asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'),
        );
        const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${css}"><title>DirTree</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
        const listener = webview.onDidReceiveMessage(async (message: unknown) => {
          if (!message || typeof message !== 'object') return;
          const data = message as Record<string, unknown>;
          try {
            switch (data.type) {
              case 'ready':
                await webview.postMessage({ type: 'init', tree, viewState });
                break;
              case 'viewState': {
                if (!validView(data.state)) return;
                if (JSON.stringify(data.state) === JSON.stringify(viewState)) return;
                viewState = data.state;
                const snapshot = viewState;
                const write = writeQueue.then(() => storage.update(viewKey, snapshot));
                writeQueue = write.catch(() => undefined);
                await write;
                break;
              }
              case 'save':
                assertTree(data.tree);
                await persist(data.tree);
                await webview.postMessage({ type: 'saved' });
                break;
              case 'copy':
                assertTree(data.tree);
                await copy(data.markdown === true, data.tree);
                await webview.postMessage({ type: 'copied', requestId: data.requestId });
                break;
            }
          } catch (error) {
            await webview.postMessage({
              type: 'error',
              message:
                error instanceof Error ? error.message : 'DirTree could not complete that action.',
            });
          }
        });
        view.onDidDispose(() => {
          listener.dispose();
          if (view === webviewView) view = undefined;
        });
      },
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('dirtree.open', () =>
      vscode.commands.executeCommand('dirtree.builder.focus'),
    ),
    vscode.commands.registerCommand('dirtree.copy', () =>
      view?.visible
        ? view.webview.postMessage({ type: 'copyRequest', markdown: false })
        : copy(false),
    ),
    vscode.commands.registerCommand('dirtree.copyMarkdown', () =>
      view?.visible
        ? view.webview.postMessage({ type: 'copyRequest', markdown: true })
        : copy(true),
    ),
  );
}
