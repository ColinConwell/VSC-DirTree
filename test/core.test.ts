import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  add,
  annotate,
  assertTree,
  commit,
  find,
  flatten,
  initialTree,
  move,
  redo,
  remove,
  rename,
  renderTree,
  undo,
  type History,
} from '../src/core/tree';

test('text rendering keeps branch guides correct and leaves the root unprefixed', () => {
  const tree = initialTree();
  assert.equal(renderTree(tree), 'project/\n├── src/\n│   └── index.ts\n└── README.md');
  assert.equal(
    renderTree(tree, true),
    '```text\nproject/\n├── src/\n│   └── index.ts\n└── README.md\n```\n',
  );
  assert.equal(flatten(tree, ['root']).length, 1);
  assert.match(renderTree(tree), /index.ts/);
});
test('empty folders render with a slash and comments align without trailing spaces', () => {
  const tree = annotate(annotate(initialTree(), 'src', 'Sources'), 'readme', 'Docs');
  const lines = renderTree(tree).split('\n');
  assert.equal(lines[1].indexOf('#'), lines[3].indexOf('#'));
  assert.ok(lines.every((line) => !line.endsWith(' ')));
  assert.equal(renderTree(remove(remove(tree, 'src'), 'readme')), 'project/');
});
test('Markdown fencing cannot be broken by backticks in names or comments', () => {
  const output = renderTree(annotate(initialTree(), 'readme', 'uses ``` examples'), true);
  assert.ok(output.startsWith('````text\n'));
  assert.ok(output.endsWith('\n````\n'));
});
test('add chooses selected folder or selected file parent and unique default names', () => {
  let tree = add(initialTree(), 'entry', 'file', 'one').tree;
  tree = add(tree, 'entry', 'file', 'two').tree;
  assert.equal(find(tree, 'one')?.parent?.id, 'src');
  assert.equal(find(tree, 'two')?.node.name, 'untitled-2.txt');
});
test('moves support reorder, nesting and outdent without losing node identity', () => {
  const original = initialTree();
  let tree = move(original, 'readme', 'entry', 'before');
  assert.deepEqual(
    find(tree, 'src')?.node.children.map((n) => n.id),
    ['readme', 'entry'],
  );
  tree = move(tree, 'entry', 'src', 'after');
  assert.deepEqual(
    tree.children.map((n) => n.id),
    ['src', 'entry'],
  );
  assert.equal(find(tree, 'entry')?.node, find(original, 'entry')?.node);
  assert.equal(move(tree, 'root', 'src', 'inside'), tree);
});
test('move rejects cycles and sibling collisions and preserves the original on failure', () => {
  let tree = add(initialTree(), 'src', 'folder', 'nested').tree;
  assert.throws(() => move(tree, 'src', 'nested', 'inside'), /itself/);
  tree = rename(add(tree, 'root', 'file', 'duplicate').tree, 'duplicate', 'index.ts');
  assert.throws(() => move(tree, 'duplicate', 'src', 'inside'), /already used/);
  assert.equal(find(tree, 'duplicate')?.parent?.id, 'root');
});
test('rename validates names and permits Unicode names', () => {
  assert.equal(find(rename(initialTree(), 'entry', '分析.ts'), 'entry')?.node.name, '分析.ts');
  for (const name of ['', '..', 'src/new', 'one\ntwo', 'a\\b'])
    assert.throws(() => rename(initialTree(), 'entry', name));
  assert.throws(() => rename(initialTree(), 'readme', 'src'), /already used/);
});
test('undo restores deleted subtrees; new changes discard redo history', () => {
  const tree = initialTree();
  let history: History = { past: [], present: tree, future: [] };
  history = commit(history, remove(tree, 'src'));
  history = undo(history);
  assert.equal(history.present, tree);
  assert.equal(redo(history).present.children.length, 1);
  history = commit(history, rename(tree, 'root', 'new-project'));
  assert.equal(history.future.length, 0);
});
test('storage validation rejects corrupt, duplicate-ID and oversized trees', () => {
  assertTree(initialTree());
  assert.throws(() => assertTree({ ...initialTree(), kind: 'file' }));
  const duplicate = initialTree();
  duplicate.children[0].id = 'root';
  assert.throws(() => assertTree(duplicate), /IDs/);
  const deep = initialTree();
  let node = deep;
  for (let i = 0; i < 65; i++) {
    node.children = [{ id: `d${i}`, name: 'nested', kind: 'folder', children: [] }];
    node = node.children[0];
  }
  assert.throws(() => assertTree(deep), /64 levels/);
});
