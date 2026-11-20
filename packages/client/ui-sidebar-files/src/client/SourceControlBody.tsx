/**
 * The `source-control` page: paths grouped by index and worktree state, with
 * untracked files listed as additions in the changes group, real stage/unstage
 * actions, and one file's unified diff beside them.
 *
 * The page is deliberately view-and-index only: Git execution belongs to the
 * Host Remote, and the browser renders the patch it returns.
 */
import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconBranchOutlineRegular, IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitDiffScope, GitDiffValue, GitStatusEntry, GitStatusValue } from '@deepseek-ai/dsh-api-workspace-files'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { CodeAppearance } from './monaco-api.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { hasMonaco, MonacoDiff } from './MonacoDiff.tsx'
import { SourceControlNavigator } from './SourceControlNavigator.tsx'
import type { SourceControlFace } from './face.ts'
import type { createFilesStore } from './store.ts'
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
  /** Live code font and palette from the theme settings. */
  readonly hooks: { readonly theme: ObservableSnapshot<CodeAppearance> }
}

/** The body's composed slot props. */
export type SourceControlBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'sidebarFiles'>
  & InjectFace<GitInjected>

/** The diff tab also owns the files store so its changes navigator stays mounted. */
export type SourceControlDiffBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createFilesStore>>
  & PropsRenderFactories
  & PropsLocale<'sidebarFiles'>
  & InjectFace<GitInjected & { readonly sourceControl?: SourceControlFace }>

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

/** One row's display letter; an untracked file reads as an addition. */
function statusLetter(entry: GitStatusEntry): string {
  if (untracked(entry)) return 'A'
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
export function SourceControlBody({
  sessionId, useSessions, readStatus, readDiff, stage, unstage, useTheme, t,
}: SourceControlBodyProps): ReactNode {
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const appearance = useTheme(value => value)
  const [status, setStatus] = useState<GitStatusValue | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<{ readonly path: string; readonly scope: GitDiffScope } | undefined>(undefined)
  const [diff, setDiff] = useState<GitDiffValue | undefined>(undefined)
  const [diffError, setDiffError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const lifetime = useRef<AbortController | undefined>(undefined)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  // The slot's inject face is stable for one occurrence, but keeping the
  // operations in refs keeps the initial-load effect from re-arming on a
  // hypothetical new identity and aborting its own read.
  const readStatusRef = useRef(readStatus)
  readStatusRef.current = readStatus
  const readDiffRef = useRef(readDiff)
  readDiffRef.current = readDiff

  const loadStatus = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const result = await readStatusRef.current(signal)
      if (signal.aborted) return
      if (result.ok) {
        setStatus(result.value)
        setError(undefined)
      } else setError(result.error.message)
    } catch (cause: unknown) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const loadDiff = useCallback(async (path: string, scope: GitDiffScope, signal: AbortSignal): Promise<void> => {
    setDiffError(undefined)
    try {
      const result = await readDiffRef.current(path, scope, signal)
      if (signal.aborted) return
      if (result.ok) setDiff(result.value)
      else setDiffError(result.error.message)
    } catch (cause: unknown) {
      if (!signal.aborted) setDiffError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

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
  const changedEntries = status?.entries.filter(unstaged) ?? []
  const empty = status !== undefined && stagedEntries.length === 0 && changedEntries.length === 0

  if (status === undefined && error === undefined) {
    return <div className={css.page} data-source-control><p className={css.note}>{t('git.loading')}</p></div>
  }
  if (status === undefined) {
    return (
      <div className={css.page} data-source-control>
        <div className={css.error} role="alert" data-source-control-error>{error}</div>
        {cwd === undefined ? null : <p className={css.note} data-source-control-cwd>{cwd}</p>}
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
          <Group title={t('git.changes')} entries={changedEntries} scope="working" selected={selected} busy={busy}
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
                : hasMonaco() && !diff.binary && diff.patch.trim().length > 0 ? <MonacoDiff diff={diff} appearance={appearance} />
                  : <DiffView diff={diff} t={t} />}
        </div>
      </div>
    </div>
  )
}


/** The tab kind and id for one selected patch. */
export const GIT_DIFF_KIND = 'source-control-diff'
export const GIT_DIFF_ID = '@deepseek-ai/dsh-client-ui-sidebar-files/source-control-diff'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** One changed path and the index scope its patch was read from. */
    'source-control-diff': { readonly path: string; readonly scope: GitDiffScope }
  }
}

/** Definition of the source-control diff tab. */
export function gitDiffDefinition(t: TranslateNS<'sidebarFiles'>): SidebarRightTabDefinition {
  return { id: GIT_DIFF_ID, kind: GIT_DIFF_KIND, priority: 'builtin', title: () => t('git.title') }
}

/** The diff tab title: the changed file's leaf name, restored from the last target. */
export function SourceControlDiffTitle({
  useTabInfo, sourceControl, t,
}: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'sidebarFiles'>
  & InjectFace<{ readonly sourceControl?: SourceControlFace }>): ReactNode {
  const { tab } = useTabInfo()
  const path = tab.navigation.params?.path ?? sourceControl?.lastDiff()?.path ?? ''
  const name = path === '' ? t('git.title') : path.split(/[/\\]/).pop() ?? path
  return <><IconBranchOutlineRegular size={16} className={css.titleIcon} /><span>{name}</span></>
}

/** One selected patch, opened beside the file it reviews rather than replacing that file's tab. */
export function SourceControlDiffBody({
  useTabInfo, useStore, readDiff, useTheme, sourceControl, sessionId, t, renderFactorySlot,
}: SourceControlDiffBodyProps): ReactNode {
  const { tab, panel } = useTabInfo()
  const navigatorShown = useStore(store => store.byPane[panel.id]?.sourceControl === true)
  const params = tab.navigation.params
  const remembered = params?.path === undefined ? sourceControl?.lastDiff() : undefined
  const path = params?.path ?? remembered?.path ?? ''
  const scope = (params !== undefined && 'scope' in params ? params.scope : undefined) ?? remembered?.scope ?? 'working'
  const appearance = useTheme(value => value)
  const [diff, setDiff] = useState<GitDiffValue>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (path === '') return
    const controller = new AbortController()
    setDiff(undefined); setError(undefined)
    void readDiff(path, scope, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setDiff(result.value); else setError(result.error.message)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { controller.abort() }
  }, [path, scope, readDiff])
  const onOpen = useCallback((address: string): void => {
    sourceControl?.openFile(address, { id: panel.id, floating: panel.isFloating }, false)
  }, [sourceControl, panel.id, panel.isFloating])
  const onEdit = useCallback((address: string): void => {
    sourceControl?.openFile(address, { id: panel.id, floating: panel.isFloating }, true)
  }, [sourceControl, panel.id, panel.isFloating])
  const navigator = sourceControl === undefined ? null : <div className={css.diffNavigator}>
    {navigatorShown
      ? <SourceControlNavigator
        useTabInfo={useTabInfo} useStore={useStore} sessionId={sessionId} t={t} sourceControl={sourceControl}
      />
      : renderFactorySlot('sidebar.files.navigator', { useTabInfo, page: true, onOpen, onEdit })}
  </div>
  const content = error !== undefined ? <p className={css.error} role="alert">{error}</p>
    : path === '' ? <p className={css.note}>{t('git.select')}</p>
      : diff === undefined ? <p className={css.note}>{t('git.loading')}</p>
        : hasMonaco() && !diff.binary && diff.patch.trim().length > 0
          ? <MonacoDiff diff={diff} appearance={appearance} />
          : <DiffView diff={diff} t={t} />
  return <div className={css.page} data-source-control-diff>
    <div className={css.diffLayout}>
      {navigator}
      <div className={css.diffPane}>{content}</div>
    </div>
  </div>
}

/** Keep one crashing body from abdicating the whole keyed tab cell and blanking the pane. */
class SourceControlBoundary extends Component<{ readonly children: ReactNode }, { readonly error?: Error }> {
  override state: { readonly error?: Error } = {}

  static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    console.error('source control body crashed', error)
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <div className={css.page} data-source-control>
        <div className={css.error} role="alert" data-source-control-crash>{this.state.error.message}</div>
      </div>
    )
  }
}

/**
 * The registered source-control body: the page plus a local crash face.
 * @param props - the slot's Session, copy, and bound Git operations.
 * @returns the page or its error message.
 */
export function SourceControlPage(props: SourceControlBodyProps): ReactNode {
  return <SourceControlBoundary><SourceControlBody {...props} /></SourceControlBoundary>
}
