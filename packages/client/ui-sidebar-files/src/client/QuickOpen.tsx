/** VS Code-style quick open: filter recent files, or search the workspace, then open one. */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { isAbsoluteWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import { quickOpenEntry, type QuickOpenEntry, type RecentFiles } from './quick-open.ts'
import type {} from './locales.ts'
import css from './QuickOpen.module.css'

/** Hooks and actions the frame's overlay gives the quick-open entry. */
export interface QuickOpenInjected {
  hooks: {
    /** A new sequence number each time the palette opens; null while it is closed. */
    open: ObservableSnapshot<number | null>
    /** Recent paths per Session. */
    recent: ObservableSnapshot<RecentFiles>
    /** The Session on screen; the palette searches its workspace. */
    mounted: ObservableSnapshot<SessionId | undefined>
  }
  /** Dismiss the palette. */
  close: () => void
  /** Open one workspace-relative path in the right sidebar. */
  openFile: (path: string) => void
  /**
   * Resolve a query to rows: an absolute path names one file (present or not);
   * anything else searches the on-screen Session's workspace by name.
   * @param query - non-empty query text.
   * @param signal - aborts the search when the query changes.
   * @returns file matches, or an empty list when the Host cannot search or the
   * absolute path does not name a regular file.
   */
  search: (query: string, signal: AbortSignal) => Promise<readonly QuickOpenEntry[]>
}

/** Runtime, locale, and injected share of the quick-open entry. */
export type QuickOpenProps = PropsRuntime<'shell.overlay'> & PropsLocale<'sidebarFiles'> & InjectFace<QuickOpenInjected>

/** Wait this long after the last keystroke before searching the Host. */
const SEARCH_DEBOUNCE_MS = 150

const EMPTY_ENTRIES: readonly QuickOpenEntry[] = []

/**
 * Render the palette: one input over the rows Enter opens.
 * @param props - the open sequence, recent paths, Session, and search/open actions.
 * @returns the palette while open, otherwise null.
 */
export function QuickOpen({ useOpen, useRecent, useMounted, close, openFile, search, t }: QuickOpenProps): ReactNode {
  const opened = useOpen(value => value)
  const recent = useRecent(value => value)
  const sessionId = useMounted(value => value)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<readonly QuickOpenEntry[]>(EMPTY_ENTRIES)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  // Each open starts from an empty query and the first row.
  useEffect(() => {
    if (opened === null) return
    setQuery('')
    setEntries(EMPTY_ENTRIES)
    setActive(0)
    input.current?.focus()
  }, [opened])
  useEffect(() => {
    if (opened === null || sessionId === undefined) return
    const trimmed = query.trim()
    if (trimmed === '') {
      setEntries((recent[sessionId] ?? []).map(quickOpenEntry))
      setActive(0)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void search(trimmed, controller.signal).then((found) => {
        if (controller.signal.aborted) return
        setEntries(found)
        setActive(0)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [opened, query, sessionId, recent, search])
  if (opened === null || sessionId === undefined) return null
  // An absolute path has no empty state of its own: the row appears when the
  // path exists, and nothing is drawn when it does not.
  const absolute = isAbsoluteWorkspacePath(query.trim())
  const pick = (entry: QuickOpenEntry | undefined): void => {
    if (entry === undefined) return
    openFile(entry.path)
    close()
  }
  const move = (step: 1 | -1): void => {
    setActive((current) => {
      if (entries.length === 0) return 0
      return (current + step + entries.length) % entries.length
    })
  }
  return (
    <Modal open onClose={close} title={t('quickOpen.command')} headless shortcutModal="quickOpen" className={clsx(css.palette)}>
      <input
        ref={input}
        className={css.input}
        value={query}
        placeholder={t('quickOpen.placeholder')}
        aria-label={t('quickOpen.placeholder')}
        role="combobox"
        aria-expanded="true"
        aria-controls="sidebar-files-quick-open-list"
        aria-activedescendant={entries.length === 0 ? undefined : `sidebar-files-quick-open-${String(active)}`}
        onChange={(event) => { setQuery(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(entries[active])
          }
        }}
      />
      {query.trim() === '' && entries.length > 0 && <div className={css.groupLabel}>{t('quickOpen.recent')}</div>}
      <div id="sidebar-files-quick-open-list" className={css.list} role="listbox" aria-label={t('quickOpen.command')}>
        {entries.map((entry, index) => (
          <div
            key={entry.path}
            id={`sidebar-files-quick-open-${String(index)}`}
            role="option"
            aria-selected={index === active}
            className={index === active ? css.rowActive : css.row}
            onMouseEnter={() => { setActive(index) }}
            onMouseDown={(event) => { event.preventDefault(); pick(entry) }}
          >
            <span className={css.name}>{entry.name}</span>
            {entry.directory !== '' && <span className={css.directory}>{entry.directory}</span>}
          </div>
        ))}
        {entries.length === 0 && !absolute && <div className={css.empty}>{query.trim() === '' ? t('quickOpen.noRecent') : t('quickOpen.empty')}</div>}
      </div>
    </Modal>
  )
}
