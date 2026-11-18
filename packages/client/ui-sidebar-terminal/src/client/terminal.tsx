/** Sidebar terminal screen and connection recovery. */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalViewState, TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ShortcutPlatform } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { TerminalBodyInjected } from './face.ts'
import type {} from './locales.ts'
import '@xterm/xterm/css/xterm.css'
import css from './terminal.module.css'
import bottomCss from './bottom-terminal.module.css'
import { TerminalTheme } from './terminal-theme.ts'
import { observeTerminalCursor } from './terminal-cursor.ts'

/** Standard sidebar owner share plus terminal model and localized copy. */
export type TerminalBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalBodyInjected>

/** Copy seat shared by the terminal surfaces. */
type TerminalCopy = PropsLocale<'sidebarTerminal'>['t']

/**
 * Presentable facts of one view, shared by the sidebar terminal and the bottom dock.
 * @param state - the view's observable state.
 * @param t - localized terminal copy.
 * @returns status line text, visible failure, and the one recovery each state offers.
 */
function terminalStatus(state: TerminalViewState, t: TerminalCopy): {
  status: string | undefined
  error: string | undefined
  ended: boolean
  retry: boolean
  readOnly: boolean
} {
  const error = state.phase === 'disconnected' ? undefined : state.issue === undefined ? state.error ?? state.info?.error : t(state.issue)
  let status: string | undefined
  if (state.phase === 'idle' || state.phase === 'loading') status = t('loading')
  else if (state.phase === 'creating' || state.phase === 'connecting' || state.phase === 'disconnected') status = t(state.phase)
  else if (state.info?.state === 'exited') status = t('exited', { code: String(state.info.exitCode ?? '—') })
  else if (state.info?.state === 'failed') status = t('unavailable')
  else if (state.phase === 'closed') status = t('closed')
  const ended = state.info?.state === 'exited' || state.phase === 'closed'
  return {
    status, error, ended,
    retry: !ended && (state.phase === 'failed' || state.phase === 'disconnected'),
    readOnly: state.phase === 'connected' && state.info?.state === 'running' && !state.writable,
  }
}

/**
 * Render the retained terminal with the application theme.
 * @param props - sidebar occurrence, model lookup and translated copy.
 * @returns the terminal screen and any pending or exceptional state.
 */
export function TerminalBody({
  useTabInfo, useTerminal, useTheme, view, openSelectionMenu, registerSelectionReader, platform, t,
}: TerminalBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const theme = useTheme(value => value)
  const model = view(tab.id)
  const state = useTerminal(tab.id)
  useEffect(() => model.mount(), [model])
  if (state === undefined) return null
  const newTerminal = <Button variant="primary" size={state.issue === 'missingTerminal' ? 'md' : 'sm'}
    icon={<span className={css.actionIcon} aria-hidden="true"><IconPlusOutlineRegular /></span>}
    onClick={() => { tab.actions.openTab('terminal', { replaceTab: true }) }}>
    {t('new')}
  </Button>
  if (state.issue === 'missingTerminal') return <section className={css.root} data-sidebar-terminal>
    <div className={css.empty}>
      <svg width="36" height="36" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="22" height="19" rx="3" fill="#17191d" />
        <path d="m8 10 4 4-4 4M15 18h5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className={css.emptyMessage} role="alert">{t('missingTerminal')}</p>
      {newTerminal}
    </div>
  </section>
  const { status, error, ended, retry, readOnly } = terminalStatus(state, t)
  return (
    <section className={css.root} data-sidebar-terminal>
      {(status !== undefined || retry || readOnly) && <div className={css.status} role="status">
        {status}
        {readOnly && <>{t('readonly')} <Button variant="outline" size="sm" onClick={() => { model.connect() }}>{t('control')}</Button></>}
        {retry && (state.info === undefined
          ? <Button variant="outline" size="sm" onClick={() => { void model.refresh() }}>{t(state.phase === 'disconnected' ? 'reconnect' : 'retry')}</Button>
          : <Button variant="outline" size="sm" onClick={() => { model.connect() }}>{t('reconnect')}</Button>)}
        {ended && newTerminal}
      </div>}
      {state.info !== undefined && <TerminalScreen state={state} model={model} tabKey={tab.id} visible={tab.visible} label={t('title')} theme={theme}
        cwd={state.environment?.cwd} openSelectionMenu={openSelectionMenu}
        registerSelectionReader={registerSelectionReader} platform={platform} />}
      {error !== undefined && <p className={css.error} role="alert">{t('failed', { message: error })}</p>}
    </section>
  )
}

/**
 * xterm.js reports the person's input and terminal-protocol replies through the same data event, so input that
 * follows a person's gesture within this window counts as typed; IME commits arrive in a later task. Scrolling is
 * not a gesture: xterm turns the wheel into arrow keys on the alternate screen, and reading must not take over.
 */
const TYPED_INPUT_WINDOW_MS = 250
const INPUT_GESTURES = ['keydown', 'beforeinput', 'paste', 'compositionend', 'drop', 'mousedown', 'touchstart'] as const
/** Focus-in and focus-out reports (DECSET 1004) that xterm.js sends when a click focuses the screen. */
const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O'])

/* oxlint-disable typescript/no-non-null-assertion -- React sets the DOM ref, then these effects initialize and use the emulator. */
export function TerminalScreen({ state, model, tabKey, visible, label, theme, cwd, openSelectionMenu, registerSelectionReader, platform }: {
  state: TerminalViewState
  model: TerminalView
  tabKey: string
  visible: boolean
  label: string
  theme: ThemeSnapshot
  cwd: string | undefined
  openSelectionMenu: TerminalBodyInjected['openSelectionMenu']
  registerSelectionReader: TerminalBodyInjected['registerSelectionReader']
  platform: ShortcutPlatform
}): ReactNode {
  const element = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal>()
  const fit = useRef<FitAddon>()
  const colors = useRef<TerminalTheme>()
  const lastRevision = useRef(0)
  const fontFamily = terminalFontFamily(theme.fontFamilies.terminal)
  const fontSize = theme.fontSizes.terminal
  const current = useRef({ state, visible, fontFamily, fontSize })
  current.current = { state, visible, fontFamily, fontSize }

  useLayoutEffect(() => {
    const node = element.current!
    const xterm = new Terminal({
      minimumContrastRatio: 4.5, cursorBlink: true, fontSize: current.current.fontSize, fontFamily: current.current.fontFamily,
      scrollback: current.current.state.environment?.scrollback ?? 0,
    })
    const addon = new FitAddon()
    xterm.loadAddon(addon)
    xterm.open(node)
    // macOS terminals send ESC b/f for Option+arrow; xterm's CSI 1;3D/C form
    // reaches readline and zsh as an unrecognized sequence whose trailing D/C
    // is inserted literally. Keep the shell-native word motion instead.
    xterm.attachCustomKeyEventHandler((event) => {
      if (platform !== 'macos' || event.type !== 'keydown' || !current.current.state.writable
        || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return true
      event.preventDefault()
      model.write(event.key === 'ArrowLeft' ? '\x1bb' : '\x1bf', true)
      return false
    })
    const palette = new TerminalTheme(xterm)
    colors.current = palette
    const cursor = observeTerminalCursor(xterm, node, () => palette.cursor)
    xterm.textarea?.setAttribute('aria-label', label)
    terminal.current = xterm
    fit.current = addon
    lastRevision.current = 0
    let gestureAt = Number.NEGATIVE_INFINITY
    const gesture = (): void => { gestureAt = performance.now() }
    for (const type of INPUT_GESTURES) node.addEventListener(type, gesture, { capture: true, passive: true })
    const input = xterm.onData((data) => {
      model.write(data, performance.now() - gestureAt < TYPED_INPUT_WINDOW_MS && !FOCUS_REPORTS.has(data))
    })
    const measure = (): void => {
      if (!current.current.visible || !current.current.state.writable || node.clientWidth === 0 || node.clientHeight === 0) return
      fitScreen(xterm, addon, current.current.state, model)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      for (const type of INPUT_GESTURES) node.removeEventListener(type, gesture, { capture: true })
      input.dispose()
      cursor.dispose()
      palette.dispose()
      xterm.dispose()
      terminal.current = undefined
      fit.current = undefined
    }
  }, [model, platform])

  // The keyboard pin gesture reads this screen's own xterm selection.
  useEffect(() => registerSelectionReader(tabKey, () => {
    if (!current.current.visible) return undefined
    const text = terminal.current?.getSelection() ?? ''
    return text.trim() === '' ? undefined : { text, ...cwd === undefined ? {} : { cwd } }
  }), [registerSelectionReader, tabKey, cwd])

  useLayoutEffect(() => {
    const style = getComputedStyle(element.current!)
    colors.current!.update(style.backgroundColor, style.color)
  }, [theme, model])

  useLayoutEffect(() => {
    const xterm = terminal.current!
    if (xterm.options.fontFamily === fontFamily && xterm.options.fontSize === fontSize) return
    // xterm remeasures cells on option change; refit so the Host grid follows the new cell size.
    xterm.options.fontFamily = fontFamily
    xterm.options.fontSize = fontSize
    const { state: live, visible: shown } = current.current
    if (shown && live.writable && element.current!.clientWidth && element.current!.clientHeight) {
      fitScreen(xterm, fit.current!, live, model)
    }
  }, [fontFamily, fontSize, model])

  useLayoutEffect(() => {
    const xterm = terminal.current!
    const render = state.render
    if (render === undefined || render.revision <= lastRevision.current) return
    lastRevision.current = render.revision
    if (render.frame.type === 'snapshot') {
      xterm.reset()
      xterm.resize(render.frame.info.cols, render.frame.info.rows)
    }
    xterm.write(render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data, () => { model.acknowledge(render.revision) })
  }, [state.render, model])

  useLayoutEffect(() => {
    const xterm = terminal.current!
    xterm.options.disableStdin = !state.writable
    if (visible && state.writable && element.current?.clientWidth && element.current.clientHeight) {
      fitScreen(xterm, fit.current!, state, model)
    } else if (state.info !== undefined && !state.writable) xterm.resize(state.info.cols, state.info.rows)
  }, [visible, state.writable, state.info?.cols, state.info?.rows, model])
  useEffect(() => {
    terminal.current!.textarea?.setAttribute('aria-label', label)
  }, [label])
  useEffect(() => { if (visible && state.writable) terminal.current!.focus() }, [visible, state.writable])
  // A non-empty selection opens the shared menu; an empty one keeps xterm's own gesture.
  const selectionMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const text = terminal.current?.getSelection() ?? ''
    if (text.trim() === '') return
    event.preventDefault()
    openSelectionMenu(text, cwd, { x: event.clientX, y: event.clientY })
  }
  // Clear locally before asking the shell, so a program that ignores the key
  // still leaves an empty view.
  const clearGesture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const primary = platform === 'macos' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
    if (!primary || event.altKey || event.shiftKey || (event.key !== 'k' && event.key !== 'l')) return
    event.preventDefault()
    event.stopPropagation()
    terminal.current?.clear()
    model.write('\x0c', true)
  }
  return <div className={css.screen} ref={element} onContextMenu={selectionMenu} onKeyDownCapture={clearGesture} />
}
/* oxlint-enable typescript/no-non-null-assertion */

/** Built-in terminal stack placed after the user's normalized list. */
const TERMINAL_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", monospace'

function terminalFontFamily(list: string): string {
  return list === '' ? TERMINAL_FONT_STACK : `${list}, ${TERMINAL_FONT_STACK}`
}

function fitScreen(xterm: Terminal, fit: FitAddon, state: TerminalViewState, model: TerminalView): void {
  const dimensions = fit.proposeDimensions()
  const environment = state.environment
  if (dimensions === undefined || environment === undefined) return
  const cols = Math.min(dimensions.cols, environment.maxCols)
  const rows = Math.min(dimensions.rows, environment.maxRows)
  if (cols < 2 || rows < 1) return
  xterm.resize(cols, rows)
  model.resize(cols, rows)
}
/** One terminal tab in the bottom dock, owned by the Session it was opened for. */
interface BottomTab {
  readonly sessionId: SessionId
  readonly key: string
  readonly contentId: string
}

/** Services and observable state the bottom dock needs. */
export interface BottomTerminalInjected {
  readonly hooks: {
    readonly activeSession: HostObservable<SessionId | undefined>
    readonly theme: HostObservable<ThemeSnapshot>
    readonly open: HostObservable<boolean>
    readonly height: HostObservable<number>
  }
  readonly view: (sessionId: SessionId, key: string, contentId: string) => TerminalView
  readonly closeView: (sessionId: SessionId, key: string, contentId: string, id?: WebTerminalId) => void
  readonly retain: (tabs: readonly { sessionId: SessionId; tabId: string; contentId: string }[]) => void
  readonly setHeight: (height: number) => void
  /** Keyboard platform that decides which modifier clears a screen. */
  readonly platform: ShortcutPlatform
}

/** Root slot props plus the bottom dock services and copy. */
export type BottomTerminalProps = PropsRuntime<'shell.bottom'> & PropsLocale<'sidebarTerminal'> & InjectFace<BottomTerminalInjected>

/** Subscribe one terminal model. */
function useTerminalState(model: TerminalView): TerminalViewState {
  const subscribe = useCallback((listener: () => void) => model.state.subscribe(listener), [model])
  return useSyncExternalStore(subscribe, () => model.state.getSnapshot(), () => model.state.getSnapshot())
}

/** Content identity for one bottom tab; stable across remounts. */
let bottomSequence = 0

function contentIdOf(sessionId: SessionId, key: string): string {
  // The bottom tab set is not persisted, so its content identity must not be
  // either: a deterministic id would recover a prior window's terminal id from
  // the binding store and land on missingTerminal after a restart.
  bottomSequence += 1
  return 'dsh-bottom-terminal:' + sessionId + ':' + key + ':' + String(bottomSequence) + ':' + Date.now().toString(36)
}

/** Empty selection hooks: the bottom dock offers neither the menu nor the pin gesture. */
const noSelectionMenu: TerminalBodyInjected['openSelectionMenu'] = () => {}
const noSelectionReader: TerminalBodyInjected['registerSelectionReader'] = () => () => {}

/**
 * One bottom occurrence. Its emulator stays mounted while the dock is hidden or
 * another tab is active, so switching never replays a stale frame or regains
 * input control from a missing attachment.
 */
function BottomTabScreen({ sessionId, tab, active, view, theme, platform, t, onNew }: {
  sessionId: SessionId
  tab: BottomTab
  active: boolean
  view: BottomTerminalInjected['view']
  theme: ThemeSnapshot
  platform: ShortcutPlatform
  t: TerminalCopy
  onNew: () => void
}): ReactNode {
  const model = view(sessionId, tab.key, tab.contentId)
  const state = useTerminalState(model)
  useEffect(() => model.mount(), [model])
  const { status, error, ended, retry, readOnly } = terminalStatus(state, t)
  const note = state.info !== undefined ? undefined
    : state.issue !== undefined ? t(state.issue)
      : state.error ?? (state.phase === 'creating' ? t('creating') : state.phase === 'connecting' ? t('connecting') : t('loading'))
  return (
    <div className={bottomCss.occurrence} data-active={active || undefined} style={active ? undefined : { display: 'none' }}>
      {note === undefined ? null : <div className={bottomCss.note}>
        <span>{note}</span>
        {state.issue === 'missingTerminal' ? <button type="button" className={bottomCss.action} onClick={onNew}>{t('new')}</button> : null}
      </div>}
      {(status !== undefined || retry || readOnly || ended) && <div className={bottomCss.status} role="status">
        {status}
        {readOnly && <>{t('readonly')} <button type="button" className={bottomCss.action} onClick={() => { model.connect() }}>{t('control')}</button></>}
        {retry && (state.info === undefined
          ? <button type="button" className={bottomCss.action} onClick={() => { void model.refresh() }}>{t(state.phase === 'disconnected' ? 'reconnect' : 'retry')}</button>
          : <button type="button" className={bottomCss.action} onClick={() => { model.connect() }}>{t('reconnect')}</button>)}
        {ended && <button type="button" className={bottomCss.action} onClick={onNew}>{t('new')}</button>}
      </div>}
      {error === undefined ? null : <p className={bottomCss.error} role="alert">{t('failed', { message: error })}</p>}
      {state.info === undefined ? null : <TerminalScreen state={state} model={model} tabKey={tab.key} visible={active} label={t('title')} theme={theme}
        cwd={state.environment?.cwd} openSelectionMenu={noSelectionMenu} registerSelectionReader={noSelectionReader} platform={platform} />}
    </div>
  )
}

/** One dock tab chip; its title follows the terminal's saved rename, then its Host name. */
function BottomTabChip({ sessionId, tab, active, view, onSelect, onClose, t }: {
  sessionId: SessionId
  tab: BottomTab
  active: boolean
  view: BottomTerminalInjected['view']
  onSelect: () => void
  onClose: () => void
  t: TerminalCopy
}): ReactNode {
  const state = useTerminalState(view(sessionId, tab.key, tab.contentId))
  const title = state.title ?? state.info?.title ?? t('title')
  return (
    <div className={bottomCss.tab} data-active={active || undefined}>
      <button type="button" className={bottomCss.tabButton} onClick={onSelect}>
        <span className={bottomCss.prompt} aria-hidden="true">{'>_'}</span>{title}
      </button>
      <button type="button" className={bottomCss.closeTab} aria-label={t('close')} title={t('close')} onClick={onClose}>×</button>
    </div>
  )
}

/**
 * Render the bottom terminal dock.
 * @param props - the active Session, theme, open/height stores, and terminal model access.
 * @returns the dock panel, hidden while it is closed or without a Session.
 */
export function BottomTerminal({
  useActiveSession, useTheme, useOpen, useHeight, view, closeView, retain, setHeight, platform, t,
}: BottomTerminalProps): ReactNode {
  const sessionId = useActiveSession(value => value)
  const theme = useTheme(value => value)
  const open = useOpen(value => value)
  const height = useHeight(value => value)
  const [tabs, setTabs] = useState<readonly BottomTab[]>([])
  const [activeKey, setActiveKey] = useState<string>()
  const next = useRef(1)
  const owningSession = useRef<SessionId | undefined>(undefined)
  const liveTabs = useRef<readonly BottomTab[]>(tabs)
  liveTabs.current = tabs
  const retainRef = useRef(retain)
  retainRef.current = retain
  const closeRef = useRef(closeView)
  closeRef.current = closeView
  // A second click before React commits the removal must not resolve a fresh
  // model for the tab it is already closing.
  const closing = useRef(new Set<string>())

  // Switching Sessions ends the terminals the previous dock owned.
  useEffect(() => {
    if (owningSession.current === sessionId) return
    const previous = owningSession.current
    owningSession.current = sessionId
    if (previous !== undefined) {
      for (const tab of liveTabs.current) closeRef.current(previous, tab.key, tab.contentId)
    }
    setTabs([])
    setActiveKey(undefined)
    next.current = 1
  }, [sessionId])

  // A Session's dock starts its first terminal the first time the dock opens, so
  // a closed dock never spawns a shell nobody asked for.
  useEffect(() => {
    if (!open || sessionId === undefined || tabs.length > 0) return
    const key = 'bottom-1'
    setTabs([{ sessionId, key, contentId: contentIdOf(sessionId, key) }])
    setActiveKey(key)
    next.current = 2
  }, [open, sessionId, tabs.length])

  // A bottom terminal is not a sidebar tab, so the terminal service has no
  // layout record to retain it. Register the dock's occurrences explicitly;
  // without this hold the Host creation waits forever and the screen is blank.
  useEffect(() => {
    retainRef.current(tabs.map(tab => ({ sessionId: tab.sessionId, tabId: tab.key, contentId: tab.contentId })))
  }, [tabs])

  useEffect(() => () => { retainRef.current([]) }, [])

  // A Session switch commits its new tab set after this render, so tabs of the
  // previous Session are never resolved against the new one.
  const owned = tabs.filter(tab => tab.sessionId === sessionId)
  const active = owned.find(tab => tab.key === activeKey) ?? owned[0]
  const visible = open && sessionId !== undefined

  const add = (): void => {
    if (sessionId === undefined) return
    const key = 'bottom-' + String(next.current)
    next.current += 1
    setTabs(list => [...list, { sessionId, key, contentId: contentIdOf(sessionId, key) }])
    setActiveKey(key)
  }

  const close = (tab: BottomTab): void => {
    if (closing.current.has(tab.contentId)) return
    closing.current.add(tab.contentId)
    const terminalView = view(tab.sessionId, tab.key, tab.contentId)
    closeView(tab.sessionId, tab.key, tab.contentId, terminalView.id)
    setTabs((list) => {
      const remaining = list.filter(item => item.key !== tab.key)
      // The dock keeps one tab: closing the last one ends its process and starts
      // a fresh shell in its place.
      return remaining.length === 0
        ? [{ sessionId: tab.sessionId, key: 'bottom-1', contentId: contentIdOf(tab.sessionId, 'bottom-1') }]
        : remaining
    })
    setActiveKey(current => current === tab.key ? undefined : current)
  }

  // Replacing the only tab reuses the fresh default close() creates.
  const reopen = (tab: BottomTab): void => {
    if (owned.length === 1) { close(tab); return }
    close(tab)
    add()
  }

  const resize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (moveEvent: PointerEvent): void => {
      const nextHeight = Math.min(Math.max(startHeight + (startY - moveEvent.clientY), 120), Math.floor(window.innerHeight * 0.7))
      setHeight(nextHeight)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <section className={bottomCss.panel} style={{ height, display: visible ? undefined : 'none' }} data-bottom-terminal>
      <div className={bottomCss.handle} role="separator" aria-orientation="horizontal" onPointerDown={resize} />
      <div className={bottomCss.tabs}>
        {owned.map(tab => (
          <BottomTabChip key={tab.key} sessionId={tab.sessionId} tab={tab} active={tab.key === active?.key}
            view={view} onSelect={() => { setActiveKey(tab.key) }} onClose={() => { close(tab) }} t={t} />
        ))}
        <button type="button" className={bottomCss.add} aria-label={t('new')} title={t('new')} onClick={add}>+</button>
      </div>
      <div className={bottomCss.body}>
        {owned.map(tab => (
          <BottomTabScreen key={tab.key} sessionId={tab.sessionId} tab={tab} active={tab.key === active?.key}
            view={view} theme={theme} platform={platform} t={t} onNew={() => { reopen(tab) }} />
        ))}
      </div>
    </section>
  )
}
