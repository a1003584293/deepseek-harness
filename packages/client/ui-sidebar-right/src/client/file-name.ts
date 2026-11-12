/** File-tab menu helpers: the leaf name, with and without its final extension. */

/**
 * Leaf name of a `/`-separated file path.
 * @param path - workspace-relative or absolute `/`-separated path.
 * @returns the final segment; a separator-only path returns itself.
 */
export function fileLeafName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path
}

/**
 * A file name without its final extension. A dotfile such as `.gitignore`, or a
 * name carrying no dot, keeps its whole name.
 * @param name - one leaf file name.
 * @returns the name before its final `.`.
 */
export function fileStem(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}
