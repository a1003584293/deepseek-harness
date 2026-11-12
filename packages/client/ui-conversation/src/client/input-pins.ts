/** Cross-plugin composer pin face: attach a path reference or a terminal selection to one Session's draft. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One user-pinned file path, optionally limited to a line range. */
export interface PinReference {
  /** Session-workspace-relative or absolute `/`-separated path. */
  readonly path: string
  /** First selected line, 1-based; present only with `endLine`. */
  readonly startLine?: number
  /** Last selected line, 1-based and inclusive; present only with `startLine`. */
  readonly endLine?: number
}

/** One user-pinned terminal selection. */
export interface PinTerminalSelection {
  /** Selected terminal text, verbatim. */
  readonly text: string
  /** Working directory the selection was captured in, when known. */
  readonly cwd?: string
}

/** Composer pin affordances other plugins reach by Session id. */
export interface InputPins {
  /**
   * Add one pinned path reference to a Session's composer.
   * @param sessionId - target Session.
   * @param reference - path with an optional 1-based line range.
   * @returns whether the composer accepted it.
   */
  addReference(sessionId: SessionId, reference: PinReference): boolean
  /**
   * Add one pinned terminal selection to a Session's composer.
   * @param sessionId - target Session.
   * @param selection - selected text and its capture directory.
   * @returns whether the composer accepted it.
   */
  addTerminalSelection(sessionId: SessionId, selection: PinTerminalSelection): boolean
}
