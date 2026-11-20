// @vitest-environment jsdom
/** Source-control tab: status groups, per-file diff, and index actions. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { GitStatusValue } from '@deepseek-ai/dsh-api-workspace-files'
import { SourceControlBody } from '../src/client/SourceControlBody.tsx'
import type { SourceControlBodyProps } from '../src/client/SourceControlBody.tsx'
import { parseUnifiedPatch } from '../src/client/MonacoDiff.tsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
  const useSessions = ((selector: (sessions: { byId: Record<string, { cwd?: string }> }) => unknown) =>
    selector({ byId: { 's-git': { cwd: '/repo' } } })) as never
  const theme = {
    fontSizes: { code: 12 }, fontFamilies: { code: '' }, active: { colorScheme: 'light' as const },
  }
  const useTheme = ((selector: (value: typeof theme) => unknown) => selector(theme)) as never
  return {
    base: {
      sessionId: 's-git', useSessions, useTheme, readStatus, readDiff, stage, unstage, t,
    } as SourceControlBodyProps,
    readStatus, readDiff, stage, unstage, ...overrides,
  }
}

describe('parseUnifiedPatch', () => {
  it('reconstructs both sides and keeps hunk line numbers', () => {
    const patch = [
      'diff --git a/file.ts b/file.ts',
      'index 111..222 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
      ' context',
      '@@ -4,1 +4,1 @@',
      '-before',
      '+after',
    ].join('\n')
    expect(parseUnifiedPatch(patch)).toEqual({
      original: 'old\ncontext\n\nbefore',
      modified: 'new\ncontext\n\nafter',
    })
  })
})

describe('SourceControlBody', () => {
  it('groups staged and changed paths, showing an untracked file as an addition in changes', async () => {
    const p = props()
    const view = render(<SourceControlBody {...p.base} />)
    await screen.findByText('staged.ts')
    expect(screen.getByText('file.ts')).toBeTruthy()
    expect(screen.getByText('new.ts')).toBeTruthy()
    expect(view.container.querySelectorAll('[data-group="working"]')).toHaveLength(1)
    const added = within(screen.getByText('new.ts').closest('button')!)
    expect(added.getByText('A')).toBeTruthy()
    expect(screen.queryByText('?')).toBeNull()
    fireEvent.click(screen.getByText('file.ts'))
    await screen.findByText('+new')
    expect(p.readDiff).toHaveBeenCalledWith('file.ts', 'working', expect.any(AbortSignal))
  })

  it('renders the selected diff with the code font, a 16px scrollbar, and the active palette', async () => {
    const createDiffEditor = vi.fn((_host: HTMLElement, _options: Record<string, unknown>) => ({ setModel: vi.fn(), dispose: vi.fn() }))
    const api = {
      editor: {
        create: vi.fn(), createModel: vi.fn(() => ({ getValue: () => '', setValue: vi.fn(), dispose: vi.fn() })),
        createDiffEditor, setModelLanguage: vi.fn(), setTheme: vi.fn(),
      },
      KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 },
    }
    vi.stubGlobal('__DSH_MONACO__', api)
    const theme = {
      fontSizes: { code: 14 }, fontFamilies: { code: '"Iosevka"' }, active: { colorScheme: 'dark' as const },
    }
    const useTheme = ((selector: (value: typeof theme) => unknown) => selector(theme)) as never
    const p = props()
    render(<SourceControlBody {...({ ...p.base, useTheme } as SourceControlBodyProps)} />)
    await screen.findByText('file.ts')
    fireEvent.click(screen.getByText('file.ts'))
    await waitFor(() => { expect(createDiffEditor).toHaveBeenCalledOnce() })
    expect(createDiffEditor.mock.calls[0]?.[1]).toMatchObject({
      fontSize: 14,
      fontFamily: '"Iosevka"',
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      scrollbar: { verticalScrollbarSize: 16, horizontalScrollbarSize: 16 },
      theme: 'vs-dark',
    })
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
