// @vitest-environment jsdom
/** The Monaco editor page: font settings, thicker scrollbar, and restored view state. */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorBody } from '../src/client/EditorBody.tsx'
import type { EditorBodyProps } from '../src/client/EditorBody.tsx'
import type { MonacoApi, MonacoViewState } from '../src/client/monaco-api.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Appearance {
  readonly fontSizes: { readonly code: number }
  readonly fontFamilies: { readonly code: string }
  readonly active: { readonly colorScheme: 'light' | 'dark' }
}

const PATH = '/work/a.ts'
const ADDRESS = 'dsh-resource://file/absolute/work/a.ts'
const SAVED_VIEW: MonacoViewState = { cursorState: [{ position: { lineNumber: 500, column: 1 } }], viewState: { scrollTop: 9000 } }

function makeMonaco(): MonacoApi & {
  readonly create: ReturnType<typeof vi.fn>
  readonly updateOptions: ReturnType<typeof vi.fn>
  readonly restoreViewState: ReturnType<typeof vi.fn>
  readonly saveViewState: ReturnType<typeof vi.fn>
  readonly setTheme: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
} {
  const model = { getValue: () => 'line', setValue: vi.fn(), dispose: vi.fn() }
  const editor = {
    setModel: vi.fn(), getModel: () => model, getValue: () => 'line',
    getSelection: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }),
    saveViewState: vi.fn(() => SAVED_VIEW),
    restoreViewState: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    addCommand: vi.fn(),
    updateOptions: vi.fn(), layout: vi.fn(), focus: vi.fn(), dispose: vi.fn(),
  }
  const api = {
    editor: {
      create: vi.fn(() => editor),
      createModel: vi.fn(() => model),
      createDiffEditor: vi.fn(() => ({ setModel: vi.fn(), dispose: vi.fn() })),
      setModelLanguage: vi.fn(),
      setTheme: vi.fn(),
    },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { KeyS: 2 },
  }
  return Object.assign(api, {
    create: api.editor.create,
    updateOptions: editor.updateOptions,
    restoreViewState: editor.restoreViewState,
    saveViewState: editor.saveViewState,
    setTheme: api.editor.setTheme,
    dispose: editor.dispose,
  })
}

function props(appearance: Appearance, remembered: MonacoViewState | undefined) {
  return {
    sessionId: 's-edit',
    useSessions: ((selector: (sessions: { byId: Record<string, { displayTitle: string; cwd: string }> }) => unknown) =>
      selector({ byId: { 's-edit': { displayTitle: 'Session', cwd: '/work' } } })) as never,
    useTabInfo: (() => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1', isFloating: false },
      tab: {
        id: 'tab-1', kind: 'file-editor', contentId: 'content-1', title: 'a.ts', visible: true,
        navigation: { address: ADDRESS, params: { path: PATH }, revision: 1 },
        signal: new AbortController().signal,
        actions: { openTab: vi.fn(), openResource: vi.fn(), close: vi.fn(), bindCommands: vi.fn() },
      },
    })) as never,
    readDocument: vi.fn(async () => ({ ok: true, value: { absolutePath: PATH, version: 'v1', text: 'line', bytes: 4 } })),
    writeDocument: vi.fn(),
    pathFor: () => PATH,
    rememberPath: vi.fn(),
    viewStateFor: vi.fn(() => remembered),
    rememberViewState: vi.fn(),
    reportSelection: vi.fn(),
    clearSelection: vi.fn(),
    publishFile: vi.fn(),
    clearFile: vi.fn(),
    readBranch: vi.fn(async () => null),
    useAccountName: ((selector: (value: string) => unknown) => selector('User')) as never,
    useAccountBalance: ((selector: (value: string) => unknown) => selector('¥1.00')) as never,
    useTheme: ((selector: (value: Appearance) => unknown) => selector(appearance)) as never,
    renderFactorySlot: vi.fn(() => null),
    t: (key: string) => key,
  }
}

describe('EditorBody', () => {
  it('creates the editor with the code font, a 16px scrollbar, and the saved view state', async () => {
    const api = makeMonaco()
    vi.stubGlobal('__DSH_MONACO__', api)
    vi.stubGlobal('__DSH_LOAD_MONACO_LANGUAGE__', async () => {})
    const appearance: Appearance = {
      fontSizes: { code: 13 }, fontFamilies: { code: '"Iosevka"' }, active: { colorScheme: 'light' },
    }
    const p = props(appearance, SAVED_VIEW)
    render(<EditorBody {...(p as EditorBodyProps)} />)
    await waitFor(() => { expect(api.create).toHaveBeenCalledOnce() })
    const options = api.create.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options).toMatchObject({
      fontSize: 13,
      fontFamily: '"Iosevka"',
      scrollbar: { verticalScrollbarSize: 16, horizontalScrollbarSize: 16 },
      theme: 'vs',
    })
    expect(p.viewStateFor).toHaveBeenCalledWith(PATH)
    expect(api.restoreViewState).toHaveBeenCalledWith(SAVED_VIEW)
  })

  it('updates font and theme live, then remembers the view state when it closes', async () => {
    const api = makeMonaco()
    vi.stubGlobal('__DSH_MONACO__', api)
    vi.stubGlobal('__DSH_LOAD_MONACO_LANGUAGE__', async () => {})
    const first: Appearance = {
      fontSizes: { code: 12 }, fontFamilies: { code: '' }, active: { colorScheme: 'light' },
    }
    const p = props(first, undefined)
    const view = render(<EditorBody {...(p as EditorBodyProps)} />)
    await waitFor(() => { expect(api.create).toHaveBeenCalledOnce() })
    expect(api.setTheme).toHaveBeenCalledWith('vs')

    const second: Appearance = {
      fontSizes: { code: 15 }, fontFamilies: { code: '"Iosevka"' }, active: { colorScheme: 'dark' },
    }
    const secondProps = props(second, undefined)
    await act(async () => { view.rerender(<EditorBody {...(secondProps as EditorBodyProps)} />) })
    expect(api.updateOptions).toHaveBeenLastCalledWith({ fontSize: 15, fontFamily: '"Iosevka"' })
    expect(api.setTheme).toHaveBeenLastCalledWith('vs-dark')

    view.unmount()
    expect(api.saveViewState).toHaveBeenCalledOnce()
    expect(secondProps.rememberViewState).toHaveBeenCalledWith(PATH, SAVED_VIEW)
  })

  it('falls back to a plain textarea without the shell-owned Monaco vendor', async () => {
    const p = props({ fontSizes: { code: 12 }, fontFamilies: { code: '' }, active: { colorScheme: 'light' } }, undefined)
    const view = render(<EditorBody {...(p as EditorBodyProps)} />)
    await waitFor(() => { expect(view.container.querySelector('textarea')).not.toBeNull() })
    expect(view.container.querySelector('[data-monaco-editor]')).toBeNull()
  })
})
