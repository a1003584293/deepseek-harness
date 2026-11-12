// @vitest-environment jsdom
/** Quick-open rows: recent-file bookkeeping, row formatting, and the palette itself. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { QuickOpen } from '../src/client/QuickOpen.tsx'
import type { QuickOpenProps } from '../src/client/QuickOpen.tsx'
import { quickOpenEntry, rememberRecent, expandQuickOpenPath, type RecentFiles } from '../src/client/quick-open.ts'

afterEach(cleanup)

const SESSION = 's-quick' as SessionId

const t = ((key: string) => key) as never

/** Render the palette over the given stores; returns its spies. */
function palette(overrides: {
  recent?: RecentFiles
  sessionId?: SessionId | undefined
  open?: number | null
  resolvePath?: QuickOpenProps['resolvePath']
  search?: QuickOpenProps['search']
} = {}) {
  const opened = createSnapshotStore<number | null>(overrides.open === undefined ? 1 : overrides.open)
  const recent = createSnapshotStore<RecentFiles>(overrides.recent ?? {})
  const mounted = createSnapshotStore<SessionId | undefined>(
    'sessionId' in overrides ? overrides.sessionId : SESSION,
  )
  const close = vi.fn()
  const openFile = vi.fn()
  const resolvePath = overrides.resolvePath ?? ((query: string) => query)
  const search = overrides.search ?? vi.fn(() => Promise.resolve([]))
  const props = {
    useOpen: (selector: (value: number | null) => unknown) => selector(opened.getSnapshot()),
    useRecent: (selector: (value: RecentFiles) => unknown) => selector(recent.getSnapshot()),
    useMounted: (selector: (value: SessionId | undefined) => unknown) => selector(mounted.getSnapshot()),
    close,
    openFile,
    resolvePath,
    search,
    t,
  } as unknown as QuickOpenProps
  const view = render(<QuickOpen {...props} />)
  return { view, opened, recent, mounted, close, openFile, search }
}

describe('recent file bookkeeping', () => {
  it('moves a path to the head without duplicating it', () => {
    const first = rememberRecent({}, SESSION, 'src/index.ts')
    expect(first[SESSION]).toEqual(['src/index.ts'])
    expect(rememberRecent(first, SESSION, 'src/index.ts')).toBe(first)
    const next = rememberRecent(first, SESSION, 'src/app.ts')
    expect(next[SESSION]).toEqual(['src/app.ts', 'src/index.ts'])
    expect(rememberRecent(next, SESSION, 'src/index.ts')[SESSION]).toEqual(['src/index.ts', 'src/app.ts'])
  })

  it('caps one Session at thirty paths', () => {
    let recent: RecentFiles = {}
    for (let index = 0; index < 31; index += 1) recent = rememberRecent(recent, SESSION, `file-${String(index)}.ts`)
    expect(recent[SESSION]).toHaveLength(30)
    expect(recent[SESSION]?.[0]).toBe('file-30.ts')
  })

  it('splits a path into its leaf name and directory', () => {
    expect(quickOpenEntry('src/client/index.ts')).toEqual({
      path: 'src/client/index.ts', name: 'index.ts', directory: 'src/client/',
    })
    expect(quickOpenEntry('README.md')).toEqual({ path: 'README.md', name: 'README.md', directory: '' })
  })
})

describe('home-rooted paths', () => {
  it('expands a leading tilde against the Host home', () => {
    expect(expandQuickOpenPath('~/Desktop/CLAUDE.md', '/Users/smith')).toBe('/Users/smith/Desktop/CLAUDE.md')
    expect(expandQuickOpenPath('~\\Desktop\\CLAUDE.md', 'C:\\Users\\smith')).toBe('C:\\Users\\smith/Desktop\\CLAUDE.md')
    expect(expandQuickOpenPath('~', '/Users/smith')).toBe('/Users/smith')
    // Without the ready frame's home, and for a name that only starts with a
    // tilde, the query stays a workspace name search.
    expect(expandQuickOpenPath('~/Desktop/CLAUDE.md', undefined)).toBe('~/Desktop/CLAUDE.md')
    expect(expandQuickOpenPath('~backup/CLAUDE.md', '/Users/smith')).toBe('~backup/CLAUDE.md')
  })
})

describe('QuickOpen', () => {
  it('renders nothing while closed and while no Session is on screen', () => {
    palette({ open: null })
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    palette({ sessionId: undefined })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists recent files and opens the highlighted row on Enter', () => {
    const { close, openFile } = palette({
      recent: { [SESSION]: ['src/client/index.ts', 'src/app.ts'] },
    })
    const input = screen.getByRole('combobox')
    expect(screen.getByText('quickOpen.recent')).toBeTruthy()
    expect(screen.getByText('index.ts')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(openFile).toHaveBeenCalledWith('src/client/index.ts')
    expect(close).toHaveBeenCalledOnce()
  })

  it('moves the highlight with the arrow keys and wraps at both ends', () => {
    const { openFile } = palette({ recent: { [SESSION]: ['a.ts', 'b.ts'] } })
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(openFile).toHaveBeenCalledWith('b.ts')
    // An empty list keeps the highlight at the first row.
    cleanup()
    const empty = palette({ recent: {} })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(empty.openFile).not.toHaveBeenCalled()
  })

  it('searches the workspace after the debounce and opens a clicked row', async () => {
    const search = vi.fn(() => Promise.resolve([quickOpenEntry('src/index.ts')]))
    const { openFile } = palette({ recent: {}, search })
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ind' } })
    await waitFor(() => { expect(search).toHaveBeenCalledWith('ind', expect.any(AbortSignal)) })
    const row = await screen.findByText('index.ts')
    fireEvent.mouseEnter(row)
    fireEvent.mouseDown(row)
    expect(openFile).toHaveBeenCalledWith('src/index.ts')
  })

  it('reports an empty workspace match and an empty recent list', async () => {
    const search = vi.fn(() => Promise.resolve([]))
    palette({ recent: {}, search })
    expect(screen.getByText('quickOpen.noRecent')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })
    await screen.findByText('quickOpen.empty')
  })

  it('draws no empty state for an absolute path that names no file', async () => {
    const search = vi.fn(() => Promise.resolve([]))
    palette({ recent: {}, search })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '/tmp/does-not-exist.py' } })
    await waitFor(() => { expect(search).toHaveBeenCalledWith('/tmp/does-not-exist.py', expect.any(AbortSignal)) })
    expect(screen.queryByText('quickOpen.empty')).toBeNull()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('probes a home-rooted query as the absolute path it names', async () => {
    const search = vi.fn(() => Promise.resolve([]))
    palette({
      recent: {},
      search,
      resolvePath: query => expandQuickOpenPath(query, '/Users/smith'),
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '~/Desktop/CLAUDE.md' } })
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith('/Users/smith/Desktop/CLAUDE.md', expect.any(AbortSignal))
    })
    expect(screen.queryByText('quickOpen.empty')).toBeNull()
  })

  it('drops an answer that arrives after the query changed', async () => {
    let resolveFirst: ((entries: readonly ReturnType<typeof quickOpenEntry>[]) => void) | undefined
    const search = vi.fn((query: string, _signal: AbortSignal) => {
      if (query !== 'first') return Promise.resolve([])
      return new Promise((resolve) => { resolveFirst = resolve })
    }) as QuickOpenProps['search']
    palette({ recent: {}, search })
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'first' } })
    await waitFor(() => { expect(search).toHaveBeenCalledTimes(1) })
    fireEvent.change(input, { target: { value: 'second' } })
    await waitFor(() => { expect(search).toHaveBeenCalledTimes(2) })
    resolveFirst?.([quickOpenEntry('late.ts')])
    await waitFor(() => { expect(screen.queryByText('late.ts')).toBeNull() })
  })
})
