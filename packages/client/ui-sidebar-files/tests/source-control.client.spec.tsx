// @vitest-environment jsdom
/** Source-control tab: status groups, per-file diff, and index actions. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GitStatusValue } from '@deepseek-ai/dsh-api-workspace-files'
import { SourceControlBody } from '../src/client/SourceControlBody.tsx'
import type { SourceControlBodyProps } from '../src/client/SourceControlBody.tsx'

afterEach(cleanup)

const t = ((key: string) => key) as never

function props(overrides: Partial<SourceControlBodyProps> = {}) {
  const status: GitStatusValue = {
    root: '/repo',
    branch: 'main',
    entries: [
      { path: 'staged.ts', index: 'M', worktree: ' ' },
      { path: 'file.ts', index: ' ', worktree: 'M' },
      { path: 'new.ts', index: '?', worktree: '?' },
    ],
  }
  const readStatus = vi.fn(() => Promise.resolve({ ok: true as const, value: status }))
  const readDiff = vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { path: 'file.ts', scope: 'working' as const, patch: 'diff --git a/file.ts b/file.ts\n@@ -1 +1 @@\n-old\n+new\n', binary: false, truncated: false },
  }))
  const stage = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
  const unstage = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
  return {
    base: { sessionId: 's-git', readStatus, readDiff, stage, unstage, t } as unknown as SourceControlBodyProps,
    readStatus, readDiff, stage, unstage, ...overrides,
  }
}

describe('SourceControlBody', () => {
  it('groups staged, unstaged, and untracked paths and opens a file diff', async () => {
    const p = props()
    render(<SourceControlBody {...p.base} />)
    await screen.findByText('staged.ts')
    expect(screen.getByText('file.ts')).toBeTruthy()
    expect(screen.getByText('new.ts')).toBeTruthy()
    fireEvent.click(screen.getByText('file.ts'))
    await screen.findByText('+new')
    expect(p.readDiff).toHaveBeenCalledWith('file.ts', 'working', expect.any(AbortSignal))
  })

  it('stages one path and refreshes status', async () => {
    const p = props()
    render(<SourceControlBody {...p.base} />)
    await screen.findByText('file.ts')
    const buttons = screen.getAllByText('git.stage')
    fireEvent.click(buttons[0]!)
    await waitFor(() => { expect(p.stage).toHaveBeenCalledWith(['file.ts'], expect.any(AbortSignal)) })
    await waitFor(() => { expect(vi.mocked(p.readStatus).mock.calls.length).toBeGreaterThan(1) })
  })

  it('unstages a staged path', async () => {
    const p = props()
    render(<SourceControlBody {...p.base} />)
    await screen.findByText('staged.ts')
    fireEvent.click(screen.getAllByText('git.unstage')[0]!)
    await waitFor(() => { expect(p.unstage).toHaveBeenCalledWith(['staged.ts'], expect.any(AbortSignal)) })
  })
})
