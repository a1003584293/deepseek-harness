/** Sidebar terminal screen and connection recovery. */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalViewState, TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { TerminalBodyInjected } from './face.ts'
import type {} from './locales.ts'
import '@xterm/xterm/css/xterm.css'
import css from './terminal.module.css'
import bottomCss from './bottom-terminal.module.css'
import { TerminalTheme } from './terminal-theme.ts'
import { observeTerminalCursor } from './terminal-cursor.ts'

/** Standard sidebar owner share plus terminal model and localized copy. */
export type TerminalBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalBodyInjected>

/**
 * Render the retained terminal with the application theme.
 * @param props - sidebar occurrence, model lookup and translated copy.
 * @returns the terminal screen and any pending or exceptional state.
 */
export function TerminalBody({
  useTabInfo, useTerminal, useTheme, view, openSelectionMenu, registerSelectionReader, t,
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
  const error = state.phase === 'disconnected' ? undefined : state.issue === undefined ? state.error ?? state.info?.error : t(state.issue)
  let status: string | undefined
  if (state.phase === 'idle' || state.phase === 'loading') status = t('loading')
  else if (state.phase === 'creating' || state.phase === 'connecting' || state.phase === 'disconnected') status = t(state.phase)
  else if (state.info?.state === 'exited') status = t('exited', { code: String(state.info.exitCode ?? '—') })
  else if (state.info?.state === 'failed') status = t('unavailable')
  else if (state.phase === 'closed') status = t('closed')
  const ended = state.info?.state === 'exited' || state.phase === 'closed'
  const retry = !ended && (state.phase === 'failed' || state.phase === 'disconnected')
  const readOnly = state.phase === 'connected' && state.info?.state === 'running' && !state.writable
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
        registerSelectionReader={registerSelectionReader} />}
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
export function TerminalScreen({ state, model, tabKey, visible, label, theme, cwd, openSelectionMenu, registerSelectionReader }: {
  state: TerminalViewState
  model: TerminalView
  tabKey: string
  visible: boolean
  label: string
  theme: ThemeSnapshot
  cwd: string | undefined
  openSelectionMenu: TerminalBodyInjected['openSelectionMenu']
  registerSelectionReader: TerminalBodyInjected['registerSelectionReader']
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
  }, [model])

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
  return <div className={css.screen} ref={element} onContextMenu={selectionMenu} />
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
/** One terminal tab in the bottom dock. */
interface BottomTab {
  readonly key: string
  readonly contentId: string
  readonly title: string
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
}

/** Root slot props plus the bottom dock services and copy. */
export type BottomTerminalProps = PropsRuntime<'shell.bottom'> & PropsLocale<'sidebarTerminal'> & InjectFace<BottomTerminalInjected>

/** Subscribe one terminal model, tolerating the moment before a tab exists. */
function useTerminalState(model: TerminalView | undefined): TerminalViewState | undefined {
  const subscribe = useCallback((listener: () => void) => model?.state.subscribe(listener) ?? (() => {}), [model])
  return useSyncExternalStore(subscribe, () => model?.state.getSnapshot(), () => model?.state.getSnapshot())
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

/**
 * Render the bottom terminal dock.
 * @param props - the active Session, theme, open/height stores, and terminal model access.
 * @returns the panel, or nothing while it is closed or has no Session.
 */
export function BottomTerminal({
  useActiveSession, useTheme, useOpen, useHeight, view, closeView, retain, setHeight, t,
}: BottomTerminalProps): ReactNode {
  const sessionId = useActiveSession(value => value)
  const theme = useTheme(value => value)
  const open = useOpen(value => value)
  const height = useHeight(value => value)
  const [tabs, setTabs] = useState<readonly BottomTab[]>([])
  const [activeKey, setActiveKey] = useState<string>()
  const next = useRef(1)
  const retainRef = useRef(retain)
  retainRef.current = retain
  const active = tabs.find(tab => tab.key === activeKey) ?? tabs[0]
  const model = sessionId === undefined || active === undefined ? undefined : view(sessionId, active.key, active.contentId)
  const state = useTerminalState(model)

  useEffect(() => {
    if (sessionId === undefined) {
      setTabs([])
      setActiveKey(undefined)
      return
    }
    const key = 'bottom-1'
    setTabs([{ key, contentId: contentIdOf(sessionId, key), title: 'zsh' }])
    setActiveKey(key)
    next.current = 2
  }, [sessionId])

  useEffect(() => {
    if (model === undefined) return
    return model.mount()
  }, [model])

  // A bottom terminal is not a sidebar tab, so the terminal service has no
  // layout record to retain it. Register the dock's occurrences explicitly;
  // without this hold the Host creation waits forever and the screen is blank.
  useEffect(() => {
    if (sessionId === undefined) {
      retainRef.current([])
      return
    }
    retainRef.current(tabs.map(tab => ({ sessionId, tabId: tab.key, contentId: tab.contentId })))
  }, [tabs, sessionId])

  useEffect(() => () => { retainRef.current([]) }, [])

  if (!open || sessionId === undefined) return null

  const add = (): void => {
    const key = 'bottom-' + String(next.current)
    next.current += 1
    setTabs(current => [...current, { key, contentId: contentIdOf(sessionId, key), title: 'zsh' }])
    setActiveKey(key)
  }

  const close = (tab: BottomTab): void => {
    const current = view(sessionId, tab.key, tab.contentId)
    closeView(sessionId, tab.key, tab.contentId, current.id)
    setTabs((list) => {
      const remaining = list.filter(item => item.key !== tab.key)
      if (remaining.length === 0) return [{ key: 'bottom-1', contentId: contentIdOf(sessionId, 'bottom-1'), title: 'zsh' }]
      return remaining
    })
    if (activeKey === tab.key) setActiveKey(tabs.find(item => item.key !== tab.key)?.key)
  }

  const clear = (): void => { model?.write('\x0c') }

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
    <section className={bottomCss.panel} style={{ height }} data-bottom-terminal>
      <div className={bottomCss.handle} role="separator" aria-orientation="horizontal" onPointerDown={resize} />
      <div className={bottomCss.tabs}>
        {tabs.map(tab => (
          <div key={tab.key} className={bottomCss.tab} data-active={tab.key === active?.key || undefined}>
            <button type="button" className={bottomCss.tabButton} onClick={() => { setActiveKey(tab.key) }}>
              <span className={bottomCss.prompt}>&gt;_</span>{tab.title}
            </button>
            <button type="button" className={bottomCss.closeTab} aria-label={t('close')} title={t('close')}
              onClick={() => { close(tab) }}>×</button>
          </div>
        ))}
        <button type="button" className={bottomCss.add} aria-label={t('new')} title={t('new')} onClick={add}>+</button>
      </div>
      <div className={bottomCss.body} onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'l')) {
          event.preventDefault()
          event.stopPropagation()
          clear()
        }
      }}>
        {state === undefined || model === undefined || active === undefined
          ? <p className={bottomCss.note}>{t('loading')}</p>
          : state.info === undefined
            ? <div className={bottomCss.note}>
              <span>{state.issue ?? state.error
                ?? (state.phase === 'creating' ? t('creating') : state.phase === 'connecting' ? t('connecting') : t('loading'))}</span>
              {state.issue === 'missingTerminal' ? <button type="button" className={bottomCss.add} onClick={add}>{t('new')}</button> : null}
            </div>
            : <TerminalScreen state={state} model={model} tabKey={active.key} visible label={t('title')} theme={theme}
              cwd={state.environment?.cwd} openSelectionMenu={() => {}} registerSelectionReader={() => () => {}} />}
      </div>
    </section>
  )
}
