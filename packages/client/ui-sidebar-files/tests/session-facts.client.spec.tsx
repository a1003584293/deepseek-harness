// @vitest-environment jsdom
/** Composer session facts: branch, Session, workspace, account, and balance. */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SessionFacts } from '../src/client/SessionFacts.tsx'
import type { SessionFactsProps } from '../src/client/SessionFacts.tsx'

afterEach(cleanup)

const SESSION = 's-facts' as SessionId

interface Overrides {
  readonly editorSessions?: ReadonlySet<SessionId>
  readonly accountName?: string
  readonly accountBalance?: string
  readonly title?: string
  readonly cwd?: string
  readonly branch?: string | null
}

function props(overrides: Overrides = {}) {
  const cwd = 'cwd' in overrides ? overrides.cwd : '/work/deepseek-harness'
  const title = 'title' in overrides ? overrides.title : '修复 Harness 文件打开与编辑器问题'
  const accountName = 'accountName' in overrides ? overrides.accountName : '喜之郎果冻'
  const accountBalance = 'accountBalance' in overrides ? overrides.accountBalance : '¥15.87'
  const readBranch = vi.fn(async () => ('branch' in overrides ? overrides.branch : 'master'))
  return {
    sessionId: SESSION,
    useSessions: ((selector: (value: { byId: Record<string, { displayTitle?: string; cwd?: string }> }) => unknown) =>
      selector({ byId: { [SESSION]: { displayTitle: title, cwd } } })) as never,
    useAccountName: ((selector: (value: string | undefined) => unknown) => selector(accountName)) as never,
    useAccountBalance: ((selector: (value: string | undefined) => unknown) => selector(accountBalance)) as never,
    useEditorSessions: ((selector: (value: ReadonlySet<SessionId>) => unknown) =>
      selector(overrides.editorSessions ?? new Set<SessionId>())) as never,
    readBranch,
  }
}

describe('SessionFacts', () => {
  it('renders the branch, Session, workspace, account, and balance after the branch resolves', async () => {
    const p = props()
    const view = render(<SessionFacts {...(p as SessionFactsProps)} />)
    await waitFor(() => { expect(view.getByText('master')).toBeTruthy() })
    expect(view.getByText('修复 Harness 文件打开与编辑器问题')).toBeTruthy()
    expect(view.getByText('deepseek-harness')).toBeTruthy()
    expect(view.getByText('喜之郎果冻')).toBeTruthy()
    expect(view.getByText('¥15.87')).toBeTruthy()
    expect(p.readBranch).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('renders nothing while a file editor is open for the Session', () => {
    const p = props({ editorSessions: new Set([SESSION]) })
    const view = render(<SessionFacts {...(p as SessionFactsProps)} />)
    expect(view.container.querySelector('[data-composer-facts]')).toBeNull()
    expect(p.readBranch).not.toHaveBeenCalled()
  })

  it('follows a live account balance and hides a missing branch', async () => {
    const p = props({ branch: null })
    const view = render(<SessionFacts {...(p as SessionFactsProps)} />)
    await waitFor(() => { expect(view.getByText('喜之郎果冻')).toBeTruthy() })
    expect(view.queryByText('master')).toBeNull()
    const next = props({ branch: null, accountBalance: '¥20.00' })
    view.rerender(<SessionFacts {...(next as SessionFactsProps)} />)
    expect(view.getByText('¥20.00')).toBeTruthy()
    expect(view.queryByText('¥15.87')).toBeNull()
  })

  it('renders nothing without any available fact', async () => {
    const p = props({ title: '', cwd: '', accountName: '', accountBalance: '', branch: null })
    const view = render(<SessionFacts {...(p as SessionFactsProps)} />)
    await waitFor(() => { expect(p.readBranch).toHaveBeenCalledOnce() })
    expect(view.container.querySelector('[data-composer-facts]')).toBeNull()
  })
})
