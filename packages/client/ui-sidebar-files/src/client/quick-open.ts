/** Quick-open list state: the recent paths one profile remembers and the rows it draws. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Recent workspace-relative paths per Session, newest first. */
export type RecentFiles = Readonly<Record<string, readonly string[]>>

/** localStorage name of the recent list. */
export const RECENT_FILES_KEY = 'sidebarFiles.recentFiles'

/** How many paths one Session remembers. */
const RECENT_LIMIT = 30

/** One row of the quick-open list. */
export interface QuickOpenEntry {
  /** Workspace-relative `/`-separated path. */
  readonly path: string
  /** Final segment, drawn first in the row. */
  readonly name: string
  /** Everything before the final segment, including its trailing `/`. */
  readonly directory: string
}

/**
 * Record one opened file at the head of its Session's list, without duplicates.
 * @param recent - current per-Session lists.
 * @param sessionId - Session the file was opened in.
 * @param path - workspace-relative `/`-separated path.
 * @returns the next lists, or the same object when the head already matches.
 */
export function rememberRecent(recent: RecentFiles, sessionId: SessionId, path: string): RecentFiles {
  const current = recent[sessionId] ?? []
  if (current[0] === path) return recent
  return {
    ...recent,
    [sessionId]: [path, ...current.filter(candidate => candidate !== path)].slice(0, RECENT_LIMIT),
  }
}

/**
 * The list row for one path.
 * @param path - workspace-relative `/`-separated path.
 * @returns the leaf name and its directory prefix.
 */
export function quickOpenEntry(path: string): QuickOpenEntry {
  const cut = path.lastIndexOf('/') + 1
  return { path, name: path.slice(cut) || path, directory: path.slice(0, cut) }
}
