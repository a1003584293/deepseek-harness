/**
 * Composer session facts: the branch, Session, workspace, account, and balance
 * shown below the composer readings while the file editor's own footer is not
 * visible. The slot occupant disappears when any file editor tab is open, so
 * the two surfaces never duplicate the same facts in a constrained row.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SessionFacts.module.css'

/** The account and editor facts the composer row renders. */
export interface SessionFactsInjected {
  /** Live account display name, balance, and the Sessions with a file editor open. */
  readonly hooks: {
    readonly accountName: ObservableSnapshot<string | undefined>
    readonly accountBalance: ObservableSnapshot<string | undefined>
    readonly editorSessions: ObservableSnapshot<ReadonlySet<SessionId>>
  }
  /** Read the workspace checkout's current branch. */
  readonly readBranch: (signal: AbortSignal) => Promise<string | null>
}

/** Standard composer-facts props plus the injected facts. */
export type SessionFactsProps = PropsRuntime<'conversation.composer.facts'> & InjectFace<SessionFactsInjected>

/**
 * Render the Session facts below the composer readings.
 * @param props - the Session, list selectors, account hooks, and branch reader.
 * @returns the facts row, or nothing while a file editor is open or no fact is available.
 */
export function SessionFacts({
  sessionId, useSessions, useAccountName, useAccountBalance, useEditorSessions, readBranch,
}: SessionFactsProps): ReactNode {
  const editorOpen = useEditorSessions(sessions => sessions.has(sessionId))
  const sessionTitle = useSessions(state => state.byId[sessionId]?.displayTitle)
  const workspacePath = useSessions(state => state.byId[sessionId]?.cwd)
  const accountName = useAccountName(value => value)
  const accountBalance = useAccountBalance(value => value)
  const [branch, setBranch] = useState<string>()
  const readBranchRef = useRef(readBranch)
  readBranchRef.current = readBranch

  useEffect(() => {
    if (editorOpen) {
      setBranch(undefined)
      return
    }
    const controller = new AbortController()
    setBranch(undefined)
    void readBranchRef.current(controller.signal).then((value) => {
      if (!controller.signal.aborted) setBranch(value ?? undefined)
    }).catch(() => {
      if (!controller.signal.aborted) setBranch(undefined)
    })
    return () => { controller.abort() }
  }, [sessionId, editorOpen])

  if (editorOpen) return null
  const workspaceName = workspacePath?.split(/[\\/]/).filter(Boolean).pop()
  const hasText = (value: string | undefined): value is string => value !== undefined && value !== ''
  const hasFact = hasText(sessionTitle) || hasText(workspaceName)
    || hasText(accountName) || hasText(accountBalance)
  if (!hasFact && !hasText(branch)) return null
  return (
    <div className={css.row} data-composer-facts>
      {branch === undefined || branch === '' ? null : (
        <span className={css.branch} title={branch} data-composer-facts-branch>
          <IconBranchOutlineRegular size={12} />
          <span className={css.branchLabel}>{branch}</span>
        </span>
      )}
      <div className={css.status}>
        {hasText(sessionTitle) ? <span className={css.item} title={sessionTitle}>{sessionTitle}</span> : null}
        {hasText(workspaceName) ? <span className={css.item} title={workspacePath}>{workspaceName}</span> : null}
        {hasText(accountName) ? <span className={css.item} title={accountName}>{accountName}</span> : null}
        {hasText(accountBalance)
          ? <span className={`${css.item} ${css.balance}`} title={accountBalance}>{accountBalance}</span>
          : null}
      </div>
    </div>
  )
}
