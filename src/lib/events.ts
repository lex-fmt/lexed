export const FILE_TREE_REFRESH_EVENT = 'lexed:file-tree-refresh';

export function dispatchFileTreeRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FILE_TREE_REFRESH_EVENT));
}
