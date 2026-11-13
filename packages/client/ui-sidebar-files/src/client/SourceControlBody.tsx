/**
 * The `source-control` page: changed paths grouped by index and worktree state,
 * with real stage/unstage actions and one file's unified diff beside them.
 *
 * The page is deliberately view-and-index only: Git execution belongs to the
 * Host Remote, and the browser renders the patch it returns.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconBranchOutlineRegular, IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitDiffScope, GitDiffValue, GitStatusEntry, GitStatusValue } from '@deepseek-ai/dsh-api-workspace-files'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import css from './SourceControlBody.module.css'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const GIT_KIND = 'source-control'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const GIT_ID = '@deepseek-ai/dsh-client-ui-sidebar-files/source-control'

/** One Host result shape the generated Remote client returns. */
export type GitResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** The bound Git operations the tab body calls for its Session. */
export interface GitInjected {
  /** Read repository status. */
  readonly readStatus: (signal: AbortSignal) => Promise<GitResult<GitStatusValue>>
  /** Read one path's diff. */
  readonly readDiff: (path: string, scope: GitDiffScope, signal: AbortSignal) => Promise<GitResult<GitDiffValue>>
  /** Stage paths. */
  readonly stage: (paths: readonly string[], signal: AbortSignal) => Promise<GitResult<unknown>>
  /** Unstage paths. */
  readonly unstage: (paths: readonly string[], signal: AbortSignal) => Promise<GitResult<unknown>>
}

/** The body's composed slot props. */
export type SourceControlBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'sidebarFiles'>
  & InjectFace<GitInjected>

/** Definition of the source-control page type. */
export function sourceControlDefinition(t: TranslateNS<'sidebarFiles'>): SidebarRightTabDefinition {
  return {
    id: GIT_ID,
    kind: GIT_KIND,
    priority: 'builtin',
    title: () => t('git.title'),
    guide: [{
      id: 'source-control',
      order: 20,
      title: () => t('git.title'),
      description: () => t('git.description'),
      icon: IconBranchOutlineRegular,
    }],
  }
}

/** The tab title: a branch glyph and the type's label. */
export function SourceControlTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconBranchOutlineRegular size={16} className={css.titleIcon} />
      {tab.title}
    </>
  )
}

/** Whether one entry has staged content. */
function staged(entry: GitStatusEntry): boolean {
  return entry.index !== ' ' && entry.index !== '?'
}

/** Whether one entry has unstaged content, including an untracked file. */
function unstaged(entry: GitStatusEntry): boolean {
  return entry.worktree !== ' ' || entry.index === '?'
}

/** Whether one entry is an untracked file. */
function untracked(entry: GitStatusEntry): boolean {
  return entry.index === '?' && entry.worktree === '?'
}

/** One row's display letter. */
function statusLetter(entry: GitStatusEntry): string {
  if (untracked(entry)) return '?'
  return entry.index !== ' ' ? entry.index : entry.worktree
}

/** One path row with its stage action. */
function PathRow({ entry, scope, selected, busy, onSelect, onApply, label }: {
  readonly entry: GitStatusEntry
  readonly scope: GitDiffScope
  readonly selected: boolean
  readonly busy: boolean
  readonly onSelect: () => void
  readonly onApply: () => void
  readonly label: string
}): ReactNode {
  return (
    <div className={css.row} data-selected={selected ? '' : undefined} data-scope={scope}>
      <button type="button" className={css.fileButton} onClick={onSelect} title={entry.path}>
        <span className={css.letter} data-letter={statusLetter(entry)}>{statusLetter(entry)}</span>
        <span className={css.path}>{entry.path}</span>
      </button>
      <button type="button" className={css.action} disabled={busy} onClick={onApply}>{label}</button>
    </div>
  )
}

/** One status group with its header and bulk action. */
function Group({ title, entries, scope, selected, busy, actionLabel, bulkLabel, onSelect, onApply, onApplyAll }: {
  readonly title: string
  readonly entries: readonly GitStatusEntry[]
  readonly scope: GitDiffScope
  readonly selected: { readonly path: string; readonly scope: GitDiffScope } | undefined
  readonly busy: boolean
  readonly actionLabel: string
  readonly bulkLabel: string
  readonly onSelect: (path: string) => void
  readonly onApply: (paths: readonly string[]) => void
  readonly onApplyAll: (paths: readonly string[]) => void
}): ReactNode {
  if (entries.length === 0) return null
  const paths = entries.map(entry => entry.path)
  return (
    <section className={css.group} data-group={scope}>
      <div className={css.groupHeader}>
        <span className={css.groupTitle}>{title}<span className={css.count}>{entries.length}</span></span>
        <button type="button" className={css.bulk} disabled={busy} onClick={() => { onApplyAll(paths) }}>{bulkLabel}</button>
      </div>
      {entries.map(entry => (
        <PathRow
          key={`${scope}:${entry.path}`}
          entry={entry}
          scope={scope}
          selected={selected?.path === entry.path && selected.scope === scope}
          busy={busy}
          onSelect={() => { onSelect(entry.path) }}
          onApply={() => { onApply([entry.path]) }}
          label={actionLabel}
        />
      ))}
    </section>
  )
}

/** Render one unified diff with add/remove/hunk coloring. */
function DiffView({ diff, t }: { readonly diff: GitDiffValue; readonly t: TranslateNS<'sidebarFiles'> }): ReactNode {
  if (diff.binary) return <p className={css.note}>{t('git.binary')}</p>
  if (diff.patch.trim().length === 0) return <p className={css.note}>{t('git.noDiff')}</p>
  return (
    <div className={css.diffScroll}>
      <div className={css.diffText}>
        {diff.patch.split('\n').map((line, index) => {
          const kind = line.startsWith('@@') ? 'hunk'
            : line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'meta'
              : line.startsWith('+') ? 'add'
                : line.startsWith('-') ? 'remove'
                  : 'context'
          return <div key={index} className={css[kind]}>{line.length === 0 ? ' ' : line}</div>
        })}
      </div>
      {diff.truncated ? <p className={css.note}>{t('git.truncated')}</p> : null}
    </div>
  )
}

/**
 * The source-control page body.
 * @param props - the tab's Session, copy, and bound Git operations.
 * @returns the status groups above the selected file's diff.
 */
export function SourceControlBody({ readStatus, readDiff, stage, unstage, t }: SourceControlBodyProps): ReactNode {
  const [status, setStatus] = useState<GitStatusValue | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<{ readonly path: string; readonly scope: GitDiffScope } | undefined>(undefined)
  const [diff, setDiff] = useState<GitDiffValue | undefined>(undefined)
  const [diffError, setDiffError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const lifetime = useRef<AbortController | undefined>(undefined)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const loadStatus = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const result = await readStatus(signal)
      if (signal.aborted) return
      if (result.ok) {
        setStatus(result.value)
        setError(undefined)
      } else setError(result.error.message)
    } catch (cause: unknown) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [readStatus])

  const loadDiff = useCallback(async (path: string, scope: GitDiffScope, signal: AbortSignal): Promise<void> => {
    setDiffError(undefined)
    try {
      const result = await readDiff(path, scope, signal)
      if (signal.aborted) return
      if (result.ok) setDiff(result.value)
      else setDiffError(result.error.message)
    } catch (cause: unknown) {
      if (!signal.aborted) setDiffError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [readDiff])

  const restart = useCallback((path?: string, scope?: GitDiffScope): void => {
    lifetime.current?.abort()
    const controller = new AbortController()
    lifetime.current = controller
    void loadStatus(controller.signal)
    if (path !== undefined && scope !== undefined) {
      setSelected({ path, scope })
      void loadDiff(path, scope, controller.signal)
    }
  }, [loadDiff, loadStatus])

  useEffect(() => {
    restart()
    return () => { lifetime.current?.abort() }
  }, [restart])

  const select = (path: string, scope: GitDiffScope): void => {
    setSelected({ path, scope })
    setDiff(undefined)
    restart(path, scope)
  }

  const apply = async (paths: readonly string[], mode: 'stage' | 'unstage'): Promise<void> => {
    if (paths.length === 0 || busy) return
    setBusy(true)
    const controller = new AbortController()
    try {
      const result = mode === 'stage' ? await stage(paths, controller.signal) : await unstage(paths, controller.signal)
      if (!result.ok) setError(result.error.message)
      else {
        const current = selectedRef.current
        restart(current?.path, current?.scope)
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const stagedEntries = status?.entries.filter(staged) ?? []
  const unstagedEntries = status?.entries.filter(entry => unstaged(entry) && !untracked(entry)) ?? []
  const untrackedEntries = status?.entries.filter(untracked) ?? []
  const empty = status !== undefined && stagedEntries.length === 0 && unstagedEntries.length === 0 && untrackedEntries.length === 0

  if (status === undefined && error === undefined) {
    return <div className={css.page} data-source-control><p className={css.note}>{t('git.loading')}</p></div>
  }
  if (status === undefined) {
    return (
      <div className={css.page} data-source-control>
        <div className={css.error} role="alert">{error}</div>
        <button type="button" className={css.retry} onClick={() => { restart() }}>{t('git.retry')}</button>
      </div>
    )
  }
  return (
    <div className={css.page} data-source-control>
      <div className={css.header}>
        <span className={css.branch} title={status.root}>
          <IconBranchOutlineRegular size={14} />
          {status.branch ?? t('git.detached')}
        </span>
        <button type="button" className={css.refresh} aria-label={t('git.refresh')} title={t('git.refresh')}
          onClick={() => { restart(selectedRef.current?.path, selectedRef.current?.scope) }}>
          <IconRefreshOutlineRegular size={14} />
        </button>
      </div>
      {error === undefined ? null : <div className={css.error} role="alert">{error}</div>}
      <div className={css.body}>
        <div className={css.list}>
          {empty ? <p className={css.note}>{t('git.empty')}</p> : null}
          <Group title={t('git.staged')} entries={stagedEntries} scope="staged" selected={selected} busy={busy}
            actionLabel={t('git.unstage')}
            bulkLabel={t('git.unstageAll')}
            onSelect={(path) => { select(path, 'staged') }}
            onApply={(paths) => { void apply(paths, 'unstage') }}
            onApplyAll={(paths) => { void apply(paths, 'unstage') }} />
          <Group title={t('git.changes')} entries={unstagedEntries} scope="working" selected={selected} busy={busy}
            actionLabel={t('git.stage')}
            bulkLabel={t('git.stageAll')}
            onSelect={(path) => { select(path, 'working') }}
            onApply={(paths) => { void apply(paths, 'stage') }}
            onApplyAll={(paths) => { void apply(paths, 'stage') }} />
          <Group title={t('git.untracked')} entries={untrackedEntries} scope="working" selected={selected} busy={busy}
            actionLabel={t('git.stage')}
            bulkLabel={t('git.stageAll')}
            onSelect={(path) => { select(path, 'working') }}
            onApply={(paths) => { void apply(paths, 'stage') }}
            onApplyAll={(paths) => { void apply(paths, 'stage') }} />
        </div>
        <div className={css.diffPane}>
          {selected === undefined
            ? <p className={css.note}>{t('git.select')}</p>
            : diffError !== undefined ? <p className={css.error}>{diffError}</p>
              : diff === undefined ? <p className={css.note}>{t('git.loading')}</p>
                : <DiffView diff={diff} t={t} />}
        </div>
      </div>
    </div>
  )
}
