export type Kind = 'file' | 'folder';
export interface TreeNode {
  id: string;
  name: string;
  kind: Kind;
  comment?: string;
  children: TreeNode[];
}
export type Placement = 'before' | 'inside' | 'after';
export interface Row {
  node: TreeNode;
  parent?: TreeNode;
  depth: number;
  position: number;
  siblings: number;
}
export const initialTree = (): TreeNode => ({
  id: 'root',
  name: 'project',
  kind: 'folder',
  children: [
    {
      id: 'src',
      name: 'src',
      kind: 'folder',
      children: [{ id: 'entry', name: 'index.ts', kind: 'file', children: [] }],
    },
    { id: 'readme', name: 'README.md', kind: 'file', children: [] },
  ],
});
export function flatten(tree: TreeNode, collapsed: readonly string[] = []): Row[] {
  const hidden = new Set(collapsed),
    rows: Row[] = [];
  function visit(node: TreeNode, depth: number, parent?: TreeNode, position = 1, siblings = 1) {
    rows.push({ node, parent, depth, position, siblings });
    if (!hidden.has(node.id))
      node.children.forEach((child, i) =>
        visit(child, depth + 1, node, i + 1, node.children.length),
      );
  }
  visit(tree, 0);
  return rows;
}
export const find = (tree: TreeNode, id: string) => flatten(tree).find((row) => row.node.id === id);
function replace(tree: TreeNode, id: string, fn: (node: TreeNode) => TreeNode): TreeNode {
  if (tree.id === id) return fn(tree);
  const children = tree.children.map((child) => replace(child, id, fn));
  return children.some((child, i) => child !== tree.children[i]) ? { ...tree, children } : tree;
}
export function normalizeName(value: string): string {
  const name = value.trim().replace(/\/+$/, '');
  if (!name || name === '.' || name === '..') throw new Error('Enter a file or folder name.');
  if (/[\x00-\x1f\x7f/\\]/.test(name))
    throw new Error('Use a single name without slashes or line breaks.');
  if (name.length > 255) throw new Error('Keep names under 256 characters.');
  return name;
}
function checkSibling(parent: TreeNode | undefined, name: string, except?: string) {
  if (parent?.children.some((child) => child.name === name && child.id !== except))
    throw new Error('That name is already used in this folder.');
}
export function rename(tree: TreeNode, id: string, value: string): TreeNode {
  const row = find(tree, id);
  if (!row) return tree;
  const name = normalizeName(value);
  checkSibling(row.parent, name, id);
  return row.node.name === name ? tree : replace(tree, id, (node) => ({ ...node, name }));
}
export function annotate(tree: TreeNode, id: string, value: string): TreeNode {
  const comment = value
    .replace(/[\r\n\x00-\x1f\x7f]+/g, ' ')
    .trim()
    .slice(0, 1000);
  return (find(tree, id)?.node.comment || '') === comment
    ? tree
    : replace(tree, id, (node) => ({ ...node, comment }));
}
export function add(
  tree: TreeNode,
  selected: string,
  kind: Kind,
  id: string,
): { tree: TreeNode; parentId: string } {
  const row = find(tree, selected);
  const parent = row?.node.kind === 'folder' ? row.node : row?.parent || tree;
  const stem = kind === 'folder' ? 'folder' : 'untitled.txt';
  let name = stem,
    n = 2;
  while (parent.children.some((child) => child.name === name))
    name = kind === 'folder' ? `folder-${n++}` : `untitled-${n++}.txt`;
  const next = replace(tree, parent.id, (node) => ({
    ...node,
    children: [...node.children, { id, name, kind, children: [] }],
  }));
  assertTree(next);
  return { tree: next, parentId: parent.id };
}
export function remove(tree: TreeNode, id: string): TreeNode {
  const parent = find(tree, id)?.parent;
  return parent
    ? replace(tree, parent.id, (node) => ({
        ...node,
        children: node.children.filter((child) => child.id !== id),
      }))
    : tree;
}
export function move(tree: TreeNode, id: string, targetId: string, placement: Placement): TreeNode {
  const source = find(tree, id),
    target = find(tree, targetId);
  if (!source?.parent || !target || id === targetId) return tree;
  const parent = placement === 'inside' ? target.node : target.parent;
  if (!parent || parent.kind !== 'folder') return tree;
  if (find(source.node, parent.id)) throw new Error('A folder cannot be moved into itself.');
  checkSibling(parent, source.node.name, id);
  const without = remove(tree, id);
  const next = replace(without, parent.id, (node) => {
    const children = [...node.children];
    const index =
      placement === 'inside'
        ? children.length
        : children.findIndex((child) => child.id === targetId) + (placement === 'after' ? 1 : 0);
    children.splice(index, 0, source.node);
    return { ...node, children };
  });
  assertTree(next);
  return JSON.stringify(next) === JSON.stringify(tree) ? tree : next;
}
export function assertTree(value: unknown): asserts value is TreeNode {
  const ids = new Set<string>();
  function visit(raw: unknown, depth: number) {
    if (!raw || typeof raw !== 'object' || depth > 64 || ids.size >= 5000)
      throw new Error('Tree is invalid or exceeds 5,000 items / 64 levels.');
    const node = raw as TreeNode;
    if (typeof node.id !== 'string' || !node.id || node.id.length > 128 || ids.has(node.id))
      throw new Error('Tree contains invalid item IDs.');
    ids.add(node.id);
    if (typeof node.name !== 'string' || normalizeName(node.name) !== node.name)
      throw new Error('Tree contains an invalid name.');
    if (node.kind !== 'file' && node.kind !== 'folder') throw new Error('Unknown item type.');
    if (!Array.isArray(node.children) || (node.kind === 'file' && node.children.length))
      throw new Error('Only folders can have children.');
    if (
      node.comment !== undefined &&
      (typeof node.comment !== 'string' ||
        node.comment.length > 1000 ||
        /[\x00-\x1f\x7f]/.test(node.comment))
    )
      throw new Error('Invalid comment.');
    if (new Set(node.children.map((child) => child?.name)).size !== node.children.length)
      throw new Error('Duplicate names in a folder.');
    node.children.forEach((child) => visit(child, depth + 1));
  }
  visit(value, 0);
  if ((value as TreeNode).kind !== 'folder') throw new Error('The root must be a folder.');
}
export function renderTree(tree: TreeNode, markdown = false): string {
  const lines: { text: string; comment?: string }[] = [];
  function visit(node: TreeNode, prefix: string, last: boolean, root = false) {
    lines.push({
      text: `${prefix}${root ? '' : last ? '└── ' : '├── '}${node.name}${node.kind === 'folder' ? '/' : ''}`,
      comment: node.comment,
    });
    node.children.forEach((child, i) =>
      visit(child, prefix + (root ? '' : last ? '    ' : '│   '), i === node.children.length - 1),
    );
  }
  visit(tree, '', true, true);
  const width =
    Math.max(...lines.filter((line) => line.comment).map((line) => [...line.text].length), 0) + 2;
  const output = lines
    .map(
      (line) =>
        line.text +
        (line.comment
          ? ' '.repeat(Math.max(2, width - [...line.text].length)) + '# ' + line.comment
          : ''),
    )
    .join('\n');
  const fence = '`'.repeat(
    Math.max(3, ...Array.from(output.matchAll(/`+/g), (match) => match[0].length + 1)),
  );
  return markdown ? `${fence}text\n${output}\n${fence}\n` : output;
}
export interface History {
  past: TreeNode[];
  present: TreeNode;
  future: TreeNode[];
}
export function commit(history: History, tree: TreeNode): History {
  return history.present === tree
    ? history
    : { past: [...history.past, history.present].slice(-100), present: tree, future: [] };
}
export function undo(history: History): History {
  return history.past.length
    ? {
        past: history.past.slice(0, -1),
        present: history.past.at(-1)!,
        future: [history.present, ...history.future].slice(0, 100),
      }
    : history;
}
export function redo(history: History): History {
  return history.future.length
    ? {
        past: [...history.past, history.present].slice(-100),
        present: history.future[0],
        future: history.future.slice(1),
      }
    : history;
}
