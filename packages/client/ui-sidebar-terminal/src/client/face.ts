/** Injected terminal commands and keyed observable state. */
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { TerminalView, TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** The terminal's React-free model is resolved by sidebar occurrence. */
export interface TerminalInjected {
  /** @param key - sidebar occurrence key. @returns its terminal commands. */
  readonly view: (key: string) => TerminalView
  /**
   * Open the shared context menu for one terminal selection.
   * @param text - selected terminal text.
   * @param cwd - the terminal's current directory, when known.
   * @param point - viewport position of the gesture.
   */
  readonly openSelectionMenu: (text: string, cwd: string | undefined, point: { readonly x: number; readonly y: number }) => void
  /**
   * Register one mounted screen's selection reader.
   * @param key - tab occurrence key.
   * @param read - the reader; returns undefined when that screen has no selection.
   * @returns the disposer removing the reader.
   */
  readonly registerSelectionReader: (key: string, read: () => { readonly text: string; readonly cwd?: string } | undefined) => () => void
  readonly keyedHooks: { readonly terminal: (key: string) => HostObservable<TerminalViewState> }
}


/** The terminal screen follows the resolved application theme through a framework hook. */
export interface TerminalBodyInjected extends TerminalInjected {
  readonly hooks: { readonly theme: HostObservable<ThemeSnapshot> }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** An existing Host terminal selected from the Session terminal list. */
    terminal: { terminalId: WebTerminalId } | { shellPath: string }
  }
}
