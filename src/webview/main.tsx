import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  type Placement,
  type Row,
  type TreeNode,
} from '../core/tree';
import './style.css';

interface Edit {
  id: string;
  field: 'name' | 'comment';
  value: string;
  fresh?: boolean;
}
interface Cache {
  history: History;
  selected: string;
  collapsed: string[];
  preview: boolean;
  scroll: number;
  edit: Edit | null;
}
interface Bridge {
  postMessage(message: unknown): void;
  getState(): Cache | undefined;
  setState(state: Cache): void;
}
declare function acquireVsCodeApi(): Bridge;
const bridge = acquireVsCodeApi();
let cached: Cache | undefined;
try {
  cached = bridge.getState();
  if (cached) assertTree(cached.history.present);
} catch {
  cached = undefined;
}

type IconName =
  | 'folder'
  | 'file'
  | 'chevron'
  | 'plus'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'check'
  | 'trash'
  | 'more'
  | 'help';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    folder: <path d="M2 5V3h4l2 2h6v8H2Z" />,
    file: (
      <>
        <path d="M4 1.5h5l3 3v10H4Z" />
        <path d="M9 1.5V5h3" />
      </>
    ),
    chevron: <path d="m6 4 4 4-4 4" />,
    plus: <path d="M8 3v10M3 8h10" />,
    undo: (
      <>
        <path d="m5 3-3 3 3 3" />
        <path d="M2 6h7a4 4 0 0 1 0 8" />
      </>
    ),
    redo: (
      <>
        <path d="m11 3 3 3-3 3" />
        <path d="M14 6H7a4 4 0 0 0 0 8" />
      </>
    ),
    copy: (
      <>
        <rect x="5" y="5" width="8" height="9" rx="1" />
        <path d="M10 5V2H2v9h3" />
      </>
    ),
    check: <path d="m3 8 3 3 7-7" />,
    trash: (
      <>
        <path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10M7 7v4M9 7v4" />
      </>
    ),
    more: (
      <>
        <circle cx="3" cy="8" r=".7" />
        <circle cx="8" cy="8" r=".7" />
        <circle cx="13" cy="8" r=".7" />
      </>
    ),
    help: (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M6 6a2 2 0 1 1 3 1.7C8 8.3 8 8.8 8 9M8 11h.01" />
      </>
    ),
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function Tool({
  label,
  icon,
  onClick,
  disabled,
  children,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={children ? 'tool labeled' : 'tool'}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}
type Action =
  | 'select'
  | 'toggle'
  | 'rename'
  | 'comment'
  | 'file'
  | 'folder'
  | 'delete'
  | 'commit'
  | 'submit'
  | 'cancel'
  | 'menu';
const TreeRow = memo(
  function TreeRow({
    row,
    selected,
    collapsed,
    edit,
    onAction,
    onEdit,
    drop,
  }: {
    row: Row;
    selected: boolean;
    collapsed: boolean;
    edit: Edit | null;
    onAction: (id: string, action: Action) => void;
    onEdit: (value: string) => void;
    drop?: Placement;
  }) {
    const { node, depth, position, siblings } = row;
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (edit) {
        input.current?.focus();
        if (edit.field === 'name') input.current?.select();
      }
    }, [edit?.id, edit?.field]);
    const field = edit ? (
      <input
        ref={input}
        aria-label={edit.field === 'name' ? 'Item name' : 'Item comment'}
        value={edit.value}
        maxLength={edit.field === 'name' ? 255 : 1000}
        placeholder={edit.field === 'comment' ? 'Describe this item…' : undefined}
        onChange={(event) => onEdit(event.target.value)}
        onBlur={() => onAction(node.id, 'commit')}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onAction(node.id, event.key === 'Enter' ? 'submit' : 'cancel');
          }
        }}
      />
    ) : null;
    return (
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-posinset={position}
        aria-setsize={siblings}
        aria-expanded={node.kind === 'folder' ? !collapsed : undefined}
        aria-selected={selected}
        aria-label={`${node.name}${node.kind === 'folder' ? ', folder' : ', file'}${node.comment ? ', ' + node.comment : ''}`}
        tabIndex={selected ? 0 : -1}
        data-id={node.id}
        data-name={node.name}
        draggable={depth > 0 && !edit}
        style={{ '--depth': depth } as React.CSSProperties}
        className={`tree-row ${selected ? 'selected' : ''} ${edit ? 'editing' : ''} ${drop ? 'drop-' + drop : ''}`}
        onFocus={(event) => {
          if (event.target === event.currentTarget) onAction(node.id, 'select');
        }}
        onClick={(event) => {
          onAction(node.id, 'select');
          if (!(event.target instanceof HTMLInputElement)) event.currentTarget.focus();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onAction(node.id, 'rename');
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onAction(node.id, 'menu');
        }}
      >
        <div className="row-line">
          <button
            tabIndex={-1}
            type="button"
            className={`disclosure ${node.kind === 'file' ? 'invisible' : ''} ${!collapsed ? 'expanded' : ''}`}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onAction(node.id, 'toggle');
            }}
          >
            <Icon name="chevron" />
          </button>
          <span className={`node-icon ${node.kind}`}>
            <Icon name={node.kind} />
          </span>
          {edit?.field === 'name' ? (
            field
          ) : (
            <span className="node-name" title={node.name}>
              {node.name}
              {node.kind === 'folder' ? <span className="slash">/</span> : null}
            </span>
          )}
          {!edit ? (
            <div className="row-tools">
              {node.kind === 'folder' ? (
                <button
                  type="button"
                  tabIndex={-1}
                  title="Add file here"
                  aria-label={`Add file to ${node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAction(node.id, 'file');
                  }}
                >
                  <Icon name="plus" />
                </button>
              ) : null}
              <button
                type="button"
                tabIndex={-1}
                title="Item actions (Shift+F10)"
                aria-label={`Actions for ${node.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(node.id, 'menu');
                }}
              >
                <Icon name="more" />
              </button>
            </div>
          ) : null}
        </div>
        {edit?.field === 'comment' ? (
          <div className="comment-editor">
            <span>#</span>
            {field}
          </div>
        ) : node.comment ? (
          <div className="comment" title={node.comment}>
            # {node.comment}
          </div>
        ) : null}
      </div>
    );
  },
  (prev, next) =>
    prev.row.node === next.row.node &&
    prev.row.depth === next.row.depth &&
    prev.row.position === next.row.position &&
    prev.row.siblings === next.row.siblings &&
    prev.selected === next.selected &&
    prev.collapsed === next.collapsed &&
    prev.edit === next.edit &&
    prev.drop === next.drop,
);

function App() {
  const [history, setHistory] = useState<History>(
    () => cached?.history || { past: [], present: initialTree(), future: [] },
  );
  const h = useRef(history);
  const [selected, setSelected] = useState(cached?.selected || 'root');
  const [collapsed, setCollapsed] = useState<string[]>(cached?.collapsed || []);
  const [editing, setEditing] = useState<Edit | null>(cached?.edit || null);
  const e = useRef(editing);
  const [preview, setPreview] = useState(cached?.preview || false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [menu, setMenu] = useState<'copy' | 'item' | 'help' | null>(null);
  const [drop, setDrop] = useState<{ id: string; placement: Placement } | null>(null);
  const treeEl = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(cached?.scroll || 0);
  const popupEl = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const dragging = useRef<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverId = useRef<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const rows = useMemo(() => flatten(history.present, collapsed), [history.present, collapsed]);
  const allRows = useMemo(() => flatten(history.present), [history.present]);
  const selectedRow = allRows.find((row) => row.node.id === selected);
  const selectedNode = selectedRow?.node || history.present;
  const output = useMemo(() => renderTree(history.present), [history.present]);
  const changeEdit = useCallback((edit: Edit | null) => {
    e.current = edit;
    setEditing(edit);
  }, []);
  const focusRow = (id: string) =>
    requestAnimationFrame(() => {
      const el = Array.from(treeEl.current?.querySelectorAll<HTMLElement>('[data-id]') || []).find(
        (el) => el.dataset.id === id,
      );
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'nearest' });
    });
  function select(id: string, focus = true) {
    setSelected(id);
    if (focus) focusRow(id);
  }
  function update(next: History) {
    const changed = next.present !== h.current.present;
    h.current = next;
    setHistory(next);
    if (changed) {
      setStatus('Saving…');
      bridge.postMessage({ type: 'save', tree: next.present });
    }
  }
  function apply(tree: TreeNode) {
    update(commit(h.current, tree));
  }
  function finish(focus = false): boolean {
    const edit = e.current;
    if (!edit) return true;
    try {
      const tree =
        edit.field === 'name'
          ? rename(h.current.present, edit.id, edit.value)
          : annotate(h.current.present, edit.id, edit.value);
      // Creation and its initial name are one undo step.
      if (edit.fresh) update({ ...h.current, present: tree });
      else apply(tree);
      changeEdit(null);
      setError('');
      if (focus) focusRow(edit.id);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }
  function cancelEdit() {
    const edit = e.current;
    if (!edit) return;
    changeEdit(null);
    setError('');
    if (edit.fresh) {
      const parent = find(h.current.present, edit.id)?.parent;
      update({ ...undo(h.current), future: [] });
      select(parent?.id || 'root');
    } else focusRow(edit.id);
  }
  function beginEdit(id: string, field: Edit['field']) {
    if (!finish()) return;
    const node = find(h.current.present, id)?.node;
    if (!node) return;
    setMenu(null);
    setSelected(id);
    changeEdit({ id, field, value: field === 'name' ? node.name : node.comment || '' });
  }
  function addItem(kind: 'file' | 'folder', id = selected) {
    if (!finish()) return;
    try {
      const newId = crypto.randomUUID();
      const result = add(h.current.present, id, kind, newId);
      apply(result.tree);
      setCollapsed((value) => value.filter((item) => item !== result.parentId));
      setSelected(newId);
      setMenu(null);
      changeEdit({
        id: newId,
        field: 'name',
        value: find(result.tree, newId)!.node.name,
        fresh: true,
      });
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function deleteItem(id = selected) {
    if (!finish()) return;
    const tree = h.current.present,
      row = find(tree, id);
    if (!row?.parent) return;
    const visible = flatten(tree, collapsed),
      index = visible.findIndex((item) => item.node.id === id);
    apply(remove(tree, id));
    setMenu(null);
    select(visible[index - 1]?.node.id || row.parent.id);
    setStatus(`Deleted ${row.node.name}. Undo to restore.`);
  }
  function travel(direction: 'undo' | 'redo') {
    if (!finish()) return;
    const next = direction === 'undo' ? undo(h.current) : redo(h.current);
    update(next);
    const id = find(next.present, selected) ? selected : next.present.id;
    select(id);
    setError('');
    setStatus(direction === 'undo' ? 'Undone.' : 'Redone.');
  }
  function moveItem(id: string, targetId: string, placement: Placement) {
    if (!finish()) return;
    try {
      const next = move(h.current.present, id, targetId, placement);
      apply(next);
      if (placement === 'inside')
        setCollapsed((value) => value.filter((item) => item !== targetId));
      select(id);
      setError('');
      setMenu(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function keyboardMove(direction: 'up' | 'down' | 'in' | 'out') {
    const row = find(h.current.present, selected);
    if (!row?.parent) return;
    const siblings = row.parent.children,
      index = siblings.findIndex((item) => item.id === selected);
    if (direction === 'up' && index > 0) moveItem(selected, siblings[index - 1].id, 'before');
    if (direction === 'down' && index < siblings.length - 1)
      moveItem(selected, siblings[index + 1].id, 'after');
    if (direction === 'in' && index > 0 && siblings[index - 1].kind === 'folder')
      moveItem(selected, siblings[index - 1].id, 'inside');
    if (direction === 'out' && row.parent.id !== h.current.present.id)
      moveItem(selected, row.parent.id, 'after');
  }
  function toggle(id: string) {
    if (!finish()) return;
    setCollapsed((value) =>
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );
    select(id);
  }
  function openMenu(kind: 'item' | 'copy' | 'help') {
    if (!finish()) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    setMenu((current) => (current === kind ? null : kind));
  }
  function closeMenu() {
    setMenu(null);
    restoreFocus.current?.focus();
  }
  function copy(markdown = false) {
    if (!finish()) return;
    setMenu(null);
    setCopying(true);
    setError('');
    const requestId = ++request.current;
    bridge.postMessage({ type: 'copy', tree: h.current.present, markdown, requestId });
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => {
      setCopying(false);
      setError('Copy did not complete. Try again, or select text in Text Preview.');
    }, 5000);
  }
  const handlers = useRef({ copy, action: (_id: string, _action: Action) => {} });
  handlers.current = {
    copy,
    action: (id, action) => {
      switch (action) {
        case 'select':
          setSelected(id);
          break;
        case 'toggle':
          toggle(id);
          break;
        case 'rename':
          beginEdit(id, 'name');
          break;
        case 'comment':
          beginEdit(id, 'comment');
          break;
        case 'file':
          addItem('file', id);
          break;
        case 'folder':
          addItem('folder', id);
          break;
        case 'delete':
          deleteItem(id);
          break;
        case 'commit':
          finish();
          break;
        case 'submit':
          finish(true);
          break;
        case 'cancel':
          cancelEdit();
          break;
        case 'menu':
          setSelected(id);
          openMenu('item');
          break;
      }
    },
  };
  const onAction = useCallback(
    (id: string, action: Action) => handlers.current.action(id, action),
    [],
  );
  const onEdit = useCallback(
    (value: string) => {
      if (e.current) changeEdit({ ...e.current, value });
    },
    [changeEdit],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'init') {
        try {
          assertTree(data.tree);
          if (JSON.stringify(data.tree) !== JSON.stringify(h.current.present)) {
            const next = { past: [], present: data.tree, future: [] };
            h.current = next;
            setHistory(next);
            changeEdit(null);
          }
          if (!cached && data.viewState) {
            const state = data.viewState;
            setSelected(find(data.tree, state.selected) ? state.selected : data.tree.id);
            setCollapsed(state.collapsed);
            setPreview(state.preview);
            initialScroll.current = state.scroll;
          }
          setReady(true);
          setStatus('');
        } catch {
          setError('DirTree could not load this draft.');
        }
      }
      if (data.type === 'saved') setStatus('Draft saved');
      if (data.type === 'copied' && data.requestId === request.current) {
        clearTimeout(copyTimer.current);
        clearTimeout(copiedTimer.current);
        setCopying(false);
        setCopied(true);
        setStatus('Copied to clipboard');
        copiedTimer.current = setTimeout(() => setCopied(false), 1800);
      }
      if (data.type === 'error') {
        clearTimeout(copyTimer.current);
        setCopying(false);
        setError(String(data.message));
      }
      if (data.type === 'copyRequest') handlers.current.copy(data.markdown === true);
    };
    window.addEventListener('message', receive);
    bridge.postMessage({ type: 'ready' });
    return () => {
      window.removeEventListener('message', receive);
      clearTimeout(copyTimer.current);
      clearTimeout(copiedTimer.current);
      clearTimeout(hoverTimer.current);
    };
  }, [changeEdit]);
  useEffect(() => {
    if (ready)
      bridge.setState({
        history,
        selected,
        collapsed,
        preview,
        scroll: treeEl.current?.scrollTop || 0,
        edit: editing,
      });
  }, [history, selected, collapsed, preview, editing, ready]);
  useEffect(() => {
    if (ready && treeEl.current) treeEl.current.scrollTop = initialScroll.current;
  }, [ready]);
  useEffect(() => {
    if (ready)
      bridge.postMessage({
        type: 'viewState',
        state: { selected, collapsed, preview, scroll: treeEl.current?.scrollTop || 0 },
      });
  }, [selected, collapsed, preview, ready]);
  useEffect(() => {
    if (menu) popupEl.current?.querySelector<HTMLElement>('button')?.focus();
  }, [menu]);
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      return;
    if (menu) return;
    const primary = event.metaKey || event.ctrlKey;
    if (primary && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      travel(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (primary && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      travel('redo');
      return;
    }
    const inTree = treeEl.current?.contains(event.target as Node);
    if (!inTree) return;
    const row = rows.find((item) => item.node.id === selected),
      index = rows.findIndex((item) => item.node.id === selected);
    const key = event.key;
    if (event.altKey && key.startsWith('Arrow')) {
      event.preventDefault();
      keyboardMove(
        ({ ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' } as const)[
          key as 'ArrowUp'
        ],
      );
      return;
    }
    if (primary && key.toLowerCase() === 'c') {
      if (!window.getSelection()?.toString()) {
        event.preventDefault();
        copy(event.shiftKey);
      }
      return;
    }
    if (primary || event.altKey) return;
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'F2',
        'Delete',
        'Backspace',
        'Enter',
        'n',
        'N',
        '?',
        'F10',
      ].includes(key)
    )
      event.preventDefault();
    if (key === 'ArrowUp') select(rows[Math.max(0, index - 1)].node.id);
    if (key === 'ArrowDown') select(rows[Math.min(rows.length - 1, index + 1)].node.id);
    if (key === 'Home') select(rows[0].node.id);
    if (key === 'End') select(rows.at(-1)!.node.id);
    if (key === 'ArrowRight' && row?.node.kind === 'folder')
      collapsed.includes(selected)
        ? toggle(selected)
        : row.node.children[0] && select(row.node.children[0].id);
    if (key === 'ArrowLeft' && row)
      row.node.kind === 'folder' && !collapsed.includes(selected)
        ? toggle(selected)
        : row.parent && select(row.parent.id);
    if (key === 'F2' || key === 'Enter') beginEdit(selected, 'name');
    if (key === 'Delete' || key === 'Backspace') deleteItem();
    if (key.toLowerCase() === 'n') addItem(event.shiftKey ? 'folder' : 'file');
    if (key === '?') openMenu('help');
    if (key === 'F10' && event.shiftKey) openMenu('item');
  }
  function stopDrag() {
    dragging.current = null;
    setDrop(null);
    clearTimeout(hoverTimer.current);
    hoverId.current = null;
  }
  const root = history.present;
  return (
    <main onKeyDown={onKeyDown} aria-label="DirTree Builder">
      <header className="toolbar" aria-label="Tree controls">
        <div className="create-tools">
          <Tool label="Add file (N)" icon="file" onClick={() => addItem('file')} disabled={!ready}>
            File <span className="add-sign">+</span>
          </Tool>
          <Tool
            label="Add folder (Shift+N)"
            icon="folder"
            onClick={() => addItem('folder')}
            disabled={!ready}
          >
            Folder <span className="add-sign">+</span>
          </Tool>
        </div>
        <div className="history-tools">
          <Tool
            label="Undo"
            icon="undo"
            disabled={!ready || !history.past.length}
            onClick={() => travel('undo')}
          />
          <Tool
            label="Redo"
            icon="redo"
            disabled={!ready || !history.future.length}
            onClick={() => travel('redo')}
          />
        </div>
      </header>
      <div
        className="tree-scroll"
        ref={treeEl}
        role="tree"
        aria-label="Directory tree"
        aria-busy={!ready}
        onScroll={() => {
          const state = bridge.getState();
          if (state && treeEl.current)
            bridge.setState({ ...state, scroll: treeEl.current.scrollTop });
        }}
        onDragStart={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
          if (!row || row.dataset.id === root.id || !finish()) {
            event.preventDefault();
            return;
          }
          dragging.current = row.dataset.id!;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-dirtree-node', dragging.current);
          setSelected(dragging.current);
        }}
        onDragOver={(event) => {
          if (!dragging.current) return;
          const row = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
          if (!row) return;
          const id = row.dataset.id!,
            node = find(h.current.present, id)?.node;
          if (
            !node ||
            id === dragging.current ||
            find(find(h.current.present, dragging.current)!.node, id)
          ) {
            setDrop(null);
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = row.getBoundingClientRect(),
            y = (event.clientY - rect.top) / rect.height;
          const placement: Placement =
            id === root.id
              ? 'inside'
              : node.kind === 'folder' && y > 0.25 && y < 0.75
                ? 'inside'
                : y < 0.5
                  ? 'before'
                  : 'after';
          setDrop((current) =>
            current?.id === id && current.placement === placement ? current : { id, placement },
          );
          if (hoverId.current !== id) {
            clearTimeout(hoverTimer.current);
            hoverId.current = id;
            if (node.kind === 'folder')
              hoverTimer.current = setTimeout(
                () => setCollapsed((value) => value.filter((item) => item !== id)),
                650,
              );
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDrop(null);
            clearTimeout(hoverTimer.current);
            hoverId.current = null;
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragging.current && drop) moveItem(dragging.current, drop.id, drop.placement);
          stopDrag();
        }}
        onDragEnd={stopDrag}
      >
        {rows.map((row) => (
          <TreeRow
            key={row.node.id}
            row={row}
            selected={row.node.id === selected || (!selectedRow && row.depth === 0)}
            collapsed={collapsed.includes(row.node.id)}
            edit={editing?.id === row.node.id ? editing : null}
            onAction={onAction}
            onEdit={onEdit}
            drop={drop?.id === row.node.id ? drop.placement : undefined}
          />
        ))}
        {root.children.length === 0 ? (
          <div className="empty">
            <p>Your tree starts here.</p>
            <span>
              Add a file or folder above.
              <br />
              Press N for a file, Shift+N for a folder.
            </span>
          </div>
        ) : null}
      </div>
      <footer>
        <button
          type="button"
          className="preview-toggle"
          aria-expanded={preview}
          onClick={() => setPreview((value) => !value)}
        >
          <span className={preview ? 'rotated' : ''}>
            <Icon name="chevron" />
          </span>
          Text Preview<span className="item-count">{allRows.length - 1} items</span>
        </button>
        {preview ? (
          <pre className="preview" aria-label="Text preview" tabIndex={0}>
            {output}
          </pre>
        ) : null}
        {error ? (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              ×
            </button>
          </div>
        ) : null}
        <div className="copy-row">
          <div className="copy-group">
            <button
              type="button"
              className="copy-main"
              disabled={!ready || copying}
              onClick={() => copy()}
            >
              <Icon name={copied ? 'check' : 'copy'} />
              {copying ? 'Copying…' : copied ? 'Copied' : 'Copy Tree'}
            </button>
            <button
              type="button"
              className="copy-options"
              aria-label="Copy options"
              aria-haspopup="menu"
              aria-expanded={menu === 'copy'}
              disabled={!ready}
              onClick={() => openMenu('copy')}
            >
              <span className="rotated">
                <Icon name="chevron" />
              </span>
            </button>
          </div>
          <Tool label="Keyboard shortcuts" icon="help" onClick={() => openMenu('help')} />
        </div>
        <div className="status" role="status" aria-live="polite">
          {status || (ready ? 'Saved in this workspace' : 'Opening draft…')}
        </div>
      </footer>
      {menu ? (
        <>
          <div className="backdrop" onMouseDown={closeMenu} />
          <div
            ref={popupEl}
            className={`popup ${menu === 'help' ? 'help-popup' : ''}`}
            role={menu === 'help' ? 'dialog' : 'menu'}
            aria-label={
              menu === 'item'
                ? 'Item actions'
                : menu === 'copy'
                  ? 'Copy format'
                  : 'Keyboard shortcuts'
            }
            aria-modal={menu === 'help' ? true : undefined}
            onKeyDown={(event) => {
              const buttons = Array.from(
                  popupEl.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ||
                    [],
                ),
                index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu();
              }
              if (['ArrowDown', 'ArrowUp', 'Tab', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (index +
                          (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)
                            ? -1
                            : 1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
            }}
          >
            {menu === 'copy' ? (
              <>
                <button role="menuitem" onClick={() => copy()}>
                  Copy Plain Text
                </button>
                <button role="menuitem" onClick={() => copy(true)}>
                  Copy as Markdown <span>```</span>
                </button>
              </>
            ) : null}
            {menu === 'item' ? (
              <>
                <div className="menu-label">{selectedNode.name}</div>
                <button role="menuitem" onClick={() => beginEdit(selected, 'name')}>
                  Rename <kbd>F2</kbd>
                </button>
                <button role="menuitem" onClick={() => beginEdit(selected, 'comment')}>
                  {selectedNode.comment ? 'Edit Comment' : 'Add Comment'} <span>#</span>
                </button>
                <div className="divider" />
                <button role="menuitem" onClick={() => addItem('file')}>
                  Add File <kbd>N</kbd>
                </button>
                <button role="menuitem" onClick={() => addItem('folder')}>
                  Add Folder <kbd>⇧ N</kbd>
                </button>
                {selected !== root.id ? (
                  <>
                    <div className="divider" />
                    <button role="menuitem" onClick={() => keyboardMove('up')}>
                      Move Up <kbd>⌥ ↑</kbd>
                    </button>
                    <button role="menuitem" onClick={() => keyboardMove('down')}>
                      Move Down <kbd>⌥ ↓</kbd>
                    </button>
                    <button role="menuitem" onClick={() => keyboardMove('in')}>
                      Indent <kbd>⌥ →</kbd>
                    </button>
                    <button role="menuitem" onClick={() => keyboardMove('out')}>
                      Outdent <kbd>⌥ ←</kbd>
                    </button>
                    <div className="divider" />
                    <button role="menuitem" className="danger" onClick={() => deleteItem()}>
                      Delete <kbd>Del</kbd>
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
            {menu === 'help' ? (
              <>
                <div className="help-heading">
                  Keyboard Shortcuts
                  <button onClick={closeMenu} aria-label="Close shortcuts">
                    ×
                  </button>
                </div>
                <p>When the tree has focus:</p>
                <dl>
                  <dt>Add file / folder</dt>
                  <dd>N / Shift N</dd>
                  <dt>Rename</dt>
                  <dd>F2 or Enter</dd>
                  <dt>Navigate / expand</dt>
                  <dd>Arrow keys</dd>
                  <dt>Move / change depth</dt>
                  <dd>Alt + arrows</dd>
                  <dt>Item actions</dt>
                  <dd>Shift F10</dd>
                  <dt>Delete item</dt>
                  <dd>Delete</dd>
                  <dt>Undo / redo</dt>
                  <dd>⌘/Ctrl Z / ⇧ Z</dd>
                  <dt>Copy / Markdown</dt>
                  <dd>⌘/Ctrl C / ⇧ C</dd>
                  <dt>Commit / cancel edit</dt>
                  <dd>Enter / Esc</dd>
                </dl>
                <p>
                  Drag between rows to reorder, or onto a folder to nest. Collapsed folders are
                  included in copied text.
                </p>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
