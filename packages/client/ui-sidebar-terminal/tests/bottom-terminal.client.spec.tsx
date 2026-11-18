// @vitest-environment jsdom
/** Bottom terminal dock: retained screens, tab lifecycle, and recovery affordances. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ITheme } from '@xterm/xterm'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { BottomTerminal, type BottomTerminalProps } from '../src/client/terminal.tsx'
import { en } from '../src/client/locales.ts'

const fake = vi.hoisted(() => ({
  terminals: [] as FakeTerminal[],
  dimensions: { cols: 120, rows: 40 } as { cols: number; rows: number } | undefined,
}))
class FakeTerminal {
  options: { disableStdin?: boolean; theme?: ITheme; fontFamily?: string; fontSize?: number; scrollback?: number }
  textarea: HTMLTextAreaElement = document.createElement('textarea')
  input: ((data: string) => void) | undefined
  readonly parser = { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) }
  renderFrame: (() => void) | undefined
  readonly onRender = vi.fn((listener: () => void) => { this.renderFrame = listener; return { dispose: vi.fn() } })
  readonly resize = vi.fn()
  readonly clear = vi.fn()
  readonly reset = vi.fn()
  readonly focus = vi.fn()
  readonly dispose = vi.fn()
  readonly write = vi.fn((_data: string, callback: () => void) => { callback() })
  readonly loadAddon = vi.fn()
  constructor(options: object) { this.options = options; fake.terminals.push(this) }
  open(node: HTMLElement) { node.appendChild(this.textarea) }
  onData(input: (data: string) => void) { this.input = input; return { dispose: vi.fn() } }
  attachCustomKeyEventHandler(_handler: (event: KeyboardEvent) => boolean) {}
}
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(function (options: object) { return new FakeTerminal(options) }) }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { proposeDimensions() { return fake.dimensions } } }))

beforeEach(() => {
  fake.terminals.length = 0
  fake.dimensions = { cols: 120, rows: 40 }
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 600)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const session = 'session' as SessionId
const otherSession = 'other' as SessionId
const info = {
  id: 'terminal' as WebTerminalId, title: 'zsh', shell: { path: '/bin/zsh', name: 'zsh', args: ['-i'] }, cwd: '/workspace',
  cols: 80, rows: 24, state: 'running' as const, exitCode: null, origin: 'user' as const, control: 'user' as const,
}
const environment = { cwd: '/workspace', maxCols: 200, maxRows: 100, scrollback: 1000, maxInputBytes: 1000, maxBufferedBytes: 100_000 }
const connected: TerminalViewState = { phase: 'connected', writable: true, info, environment }

/** One observable terminal view with a test-owned state driver. */
function terminalModel(id: string) {
  let snapshot: TerminalViewState = connected
  const listeners = new Set<() => void>()
  return {
    id: id as WebTerminalId,
    state: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    mount: vi.fn(() => vi.fn()),
    refresh: vi.fn(async () => {}),
    connect: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    acknowledge: vi.fn(),
    update(next: TerminalViewState) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Dock harness with mutable Session, open, and height hooks. */
function harness(initial: { active?: SessionId | undefined; open?: boolean } = {}) {
  let active = initial.active === undefined && 'active' in initial ? undefined : session
  let open = initial.open ?? false
  let height = 280
  const models = new Map<string, ReturnType<typeof terminalModel>>()
  const view = vi.fn((sessionId: SessionId, key: string, _contentId: string) => {
    const id = sessionId + ':' + key
    let model = models.get(id)
    if (model === undefined) {
      model = terminalModel('terminal-' + String(models.size + 1))
      models.set(id, model)
    }
    return model
  })
  const closeView = vi.fn<(sessionId: SessionId, key: string, contentId: string, id?: WebTerminalId) => void>()
  const retain = vi.fn<(tabs: readonly { sessionId: SessionId; tabId: string; contentId: string }[]) => void>()
  const setHeight = vi.fn((value: number) => { height = value })
  const theme: ThemeSnapshot = {
    preference: 'light', fontSizes: { text: 14, code: 11, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' },
    active: { id: 'light', colorScheme: 'light', tokens: {} }, themes: [], revision: 0,
  }
  const props = () => ({
    useActiveSession: (select: (value: SessionId | undefined) => unknown) => select(active),
    useTheme: (select: (value: ThemeSnapshot) => unknown) => select(theme),
    useOpen: (select: (value: boolean) => unknown) => select(open),
    useHeight: (select: (value: number) => unknown) => select(height),
    view, closeView, retain, setHeight, platform: 'macos' as const, t: makeTranslate(en),
  } as unknown as BottomTerminalProps)
  const ui = render(<BottomTerminal {...props()} />)
  const rerender = (): void => { ui.rerender(<BottomTerminal {...props()} />) }
  return {
    ui, view, closeView, retain, setHeight, models,
    panel: (): HTMLElement => ui.container.querySelector('[data-bottom-terminal]')!,
    setActive(next: SessionId | undefined) { active = next; rerender() },
    setOpen(next: boolean) { open = next; rerender() },
    update(key: string, next: TerminalViewState) { act(() => { models.get(key)!.update(next) }) },
  }
}

it('starts no shell while the dock is closed and creates the first tab when it opens', () => {
  const h = harness()
  expect(h.view).not.toHaveBeenCalled()
  expect(h.panel().style.display).toBe('none')
  expect(h.retain).toHaveBeenLastCalledWith([])

  h.setOpen(true)
  expect(h.panel().style.display).toBe('')
  expect(h.models.size).toBe(1)
  expect(h.view).toHaveBeenCalledWith(session, 'bottom-1', expect.any(String))
  const retained = h.retain.mock.calls.at(-1)![0][0]
  expect(retained).toBeDefined()
  if (retained === undefined) throw new Error('the dock retained no terminal')
  expect(retained.sessionId).toBe(session)
  expect(retained.tabId).toBe('bottom-1')
  expect(retained.contentId).toContain('dsh-bottom-terminal:session:bottom-1:')
  expect(fake.terminals).toHaveLength(1)
})

it('keeps every tab emulator alive across tab switches and closing another tab', () => {
  const h = harness({ open: true })
  const first = fake.terminals[0]!
  fireEvent.click(h.ui.getByRole('button', { name: en.new }))
  expect(h.models.size).toBe(2)
  expect(fake.terminals).toHaveLength(2)
  const second = fake.terminals[1]!
  expect(first.dispose).not.toHaveBeenCalled()

  // Switch back to the first tab: both emulators remain, and the active one is shown.
  fireEvent.click(h.ui.getAllByRole('button', { name: 'zsh' })[0]!)
  expect(fake.terminals).toEqual([first, second])
  expect(first.dispose).not.toHaveBeenCalled()
  expect(h.ui.container.querySelectorAll('[data-active]').length).toBeGreaterThan(0)

  // Closing the second tab ends only its terminal.
  const closeButton = h.ui.getAllByRole('button', { name: en.close })[1]!
  fireEvent.click(closeButton)
  const closed = h.closeView.mock.calls[0]!
  expect(closed.slice(0, 2)).toEqual([session, 'bottom-2'])
  expect(closed[2]).toContain('dsh-bottom-terminal:session:bottom-2:')
  expect(closed[3]).toBe('terminal-2')
  expect(second.dispose).toHaveBeenCalledOnce()
  expect(first.dispose).not.toHaveBeenCalled()
  // A second click before the removal commits must not resolve a fresh model.
  fireEvent.click(closeButton)
  expect(h.closeView).toHaveBeenCalledOnce()
  expect(h.models.size).toBe(2)
})

it('keeps the emulators and their screens while the dock is hidden', () => {
  const h = harness({ open: true })
  const terminal = fake.terminals[0]!
  const writes = terminal.write.mock.calls.length

  h.setOpen(false)
  expect(h.panel().style.display).toBe('none')
  expect(terminal.dispose).not.toHaveBeenCalled()
  expect(fake.terminals).toHaveLength(1)

  h.setOpen(true)
  expect(h.panel().style.display).toBe('')
  expect(fake.terminals).toEqual([terminal])
  expect(terminal.dispose).not.toHaveBeenCalled()
  // Reopening replays nothing: the screen was never torn down.
  expect(terminal.write.mock.calls.length).toBe(writes)
})

it('ends the previous Session terminals and starts the new Session dock when the active Session changes', () => {
  const h = harness({ open: true })
  const first = fake.terminals[0]!
  h.setActive(otherSession)
  const closed = h.closeView.mock.calls[0]!
  expect(closed.slice(0, 2)).toEqual([session, 'bottom-1'])
  expect(closed[2]).toContain('dsh-bottom-terminal:session:bottom-1:')
  const reopened = h.view.mock.calls.at(-1)!
  expect(reopened[0]).toBe(otherSession)
  expect(reopened[1]).toBe('bottom-1')
  expect(reopened[2]).toContain('dsh-bottom-terminal:other:bottom-1:')
  expect(fake.terminals).toHaveLength(2)
  expect(first.dispose).toHaveBeenCalledOnce()
})

it('surfaces read-only, disconnected, ended, and failed views with their recovery actions', () => {
  const h = harness({ open: true })
  h.update('session:bottom-1', { ...connected, writable: false })
  expect(h.ui.getByRole('status').textContent).toContain(en.readonly)
  fireEvent.click(h.ui.getByRole('button', { name: en.control }))
  expect(h.models.get('session:bottom-1')!.connect).toHaveBeenCalledOnce()

  h.update('session:bottom-1', { ...connected, phase: 'disconnected', writable: false })
  expect(h.ui.getByRole('status').textContent).toContain(en.disconnected)
  fireEvent.click(h.ui.getByRole('button', { name: en.reconnect }))
  expect(h.models.get('session:bottom-1')!.connect).toHaveBeenCalledTimes(2)

  h.update('session:bottom-1', { ...connected, writable: false, error: 'boom', phase: 'failed' })
  expect(h.ui.getByRole('alert').textContent).toContain('Terminal error: boom')

  h.update('session:bottom-1', { ...connected, info: { ...info, state: 'exited', exitCode: 0 } })
  expect(h.ui.getByRole('status').textContent).toContain('Process exited (0)')
  const endedContentId = h.view.mock.calls.at(-1)![2]
  fireEvent.click(within(h.ui.getByRole('status')).getByRole('button', { name: en.new }))
  expect(h.closeView).toHaveBeenCalledWith(session, 'bottom-1', endedContentId, 'terminal-1')
  // The replacement tab binds a new content identity, so its terminal is new too.
  expect(h.view).toHaveBeenLastCalledWith(session, 'bottom-1', expect.not.stringMatching(endedContentId))
})

it('resizes the dock through the separator handle', () => {
  const h = harness({ open: true })
  const handle = h.ui.getByRole('separator')
  fireEvent.pointerDown(handle, { clientY: 300 })
  fireEvent.pointerMove(handle, { clientY: 200 })
  fireEvent.pointerUp(handle)
  expect(h.setHeight).toHaveBeenCalledWith(380)
})

it('stays hidden and starts nothing without an active Session', () => {
  const h = harness({ active: undefined, open: true })
  expect(h.panel().style.display).toBe('none')
  expect(h.view).not.toHaveBeenCalled()
  expect(h.retain).toHaveBeenLastCalledWith([])
})
