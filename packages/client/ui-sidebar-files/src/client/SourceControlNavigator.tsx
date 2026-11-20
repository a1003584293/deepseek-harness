/** Source-control changes drawn inside the file navigator instead of a page tab. */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitDiffScope, GitStatusEntry, GitStatusValue } from '@deepseek-ai/dsh-api-workspace-files'
import { IconBranchOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SourceControlBody.module.css'

type SourceControlNavigatorProps = FactoryComponentPropsOf<'sidebar.files.navigator'>

function staged(entry: GitStatusEntry): boolean { return entry.index !== ' ' && entry.index !== '?' }
function unstaged(entry: GitStatusEntry): boolean { return entry.worktree !== ' ' || entry.index === '?' }
function untracked(entry: GitStatusEntry): boolean { return entry.index === '?' && entry.worktree === '?' }
function letter(entry: GitStatusEntry): string { return untracked(entry) ? 'A' : entry.index !== ' ' ? entry.index : entry.worktree }

/** One changes group in the navigator. */
function Group({ title, entries, scope, busy, label, onOpen, onApply }: {
  readonly title: string
  readonly entries: readonly GitStatusEntry[]
  readonly scope: GitDiffScope
  readonly busy: boolean
  readonly label: string
  readonly onOpen: (path: string, scope: GitDiffScope) => void
  readonly onApply: (path: string, scope: GitDiffScope) => void
}): ReactNode {
  if (entries.length === 0) return null
  return <section className={css.group} data-group={scope}>
    <div className={css.groupHeader}>
      <span className={css.groupTitle}>{title}<span className={css.count}>{entries.length}</span></span>
    </div>
    {entries.map(entry => <div className={css.row} key={`${scope}:${entry.path}`}>
      <button type="button" className={css.fileButton} title={entry.path} onClick={() => { onOpen(entry.path, scope) }}>
        <span className={css.letter} data-letter={letter(entry)}>{letter(entry)}</span>
        <span className={css.path}>{entry.path}</span>
      </button>
      <button type="button" className={css.action} disabled={busy} onClick={() => { onApply(entry.path, scope) }}>{label}</button>
    </div>)}
  </section>
}

/**
 * Draw source-control changes in the pane's navigator.
 * @param props - the pane, store, localized copy, and source-control face.
 * @returns the grouped files, or a loading/failure sentence.
 */
export function SourceControlNavigator({ useTabInfo, useStore, sourceControl, sessionId, t }: SourceControlNavigatorProps): ReactNode {
  const { panel } = useTabInfo()
  const mode = useStore(store => store.byPane[panel.id]?.sourceControl === true)
  const [status, setStatus] = useState<GitStatusValue>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const load = useCallback((signal: AbortSignal): void => {
    if (sourceControl === undefined) return
    void sourceControl.readStatus(signal).then((result) => {
      if (signal.aborted) return
      if (result.ok) { setStatus(result.value); setError(undefined) } else setError(result.error.message)
    }).catch((cause: unknown) => { if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) })
  }, [sourceControl])
  useEffect(() => {
    if (!mode) return
    const controller = new AbortController()
    load(controller.signal)
    return () => { controller.abort() }
  }, [load, mode, revision])
  if (!mode) return null
  if (sourceControl === undefined) return <p className={css.note}>{t('git.loading')}</p>
  if (status === undefined) return <div className={css.navigator}>
    {error === undefined ? <p className={css.note}>{t('git.loading')}</p>
      : <><p className={css.error} role="alert">{error}</p><button type="button" className={css.retry} onClick={() => { setRevision(value => value + 1) }}>{t('git.retry')}</button></>}
  </div>
  const apply = (path: string, scope: GitDiffScope): void => {
    if (busy) return
    setBusy(true)
    const controller = new AbortController()
    const operation = scope === 'staged' ? sourceControl.unstage([path], controller.signal) : sourceControl.stage([path], controller.signal)
    void Promise.resolve(operation).then(() => { setRevision(value => value + 1) }).finally(() => { setBusy(false) })
  }
  const stagedEntries = status.entries.filter(staged)
  const changedEntries = status.entries.filter(unstaged)
  return <div className={css.navigator} data-source-control-navigator data-session={sessionId}>
    <div className={css.navigatorHeader}>
      <span className={css.branch} title={status.root}><IconBranchOutlineRegular size={12} />{status.branch ?? t('git.detached')}</span>
      <button type="button" className={css.refresh} aria-label={t('git.refresh')} title={t('git.refresh')} onClick={() => { setRevision(value => value + 1) }}><IconRefreshOutlineRegular size={12} /></button>
    </div>
    {status.entries.length === 0 ? <p className={css.note}>{t('git.empty')}</p> : null}
    <Group title={t('git.staged')} entries={stagedEntries} scope="staged" busy={busy} label={t('git.unstage')} onOpen={sourceControl.openDiff} onApply={apply} />
    <Group title={t('git.changes')} entries={changedEntries} scope="working" busy={busy} label={t('git.stage')} onOpen={sourceControl.openDiff} onApply={apply} />
  </div>
}
