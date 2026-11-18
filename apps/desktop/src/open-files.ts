/** Paths the operating system asked the running Desktop application to open. */

import { isAbsolute, resolve } from 'node:path'

/** Whether one candidate path names an existing regular file. */
export interface DesktopOpenFilesOptions {
  /** Answer for an absolute path; false for a missing path, directory, or unreadable file. */
  readonly isFile: (path: string) => boolean
}

/**
 * Queue launch-time file opens until the application document asks for them.
 * The queue belongs to the Desktop process, not a window: a later window, a
 * renderer reload, and a second launch all drain the same list.
 */
export class DesktopOpenFiles {
  private readonly pending: string[] = []
  private readonly listeners = new Set<() => void>()

  /** @param options - the filesystem check applied to every queued path. */
  constructor(private readonly options: DesktopOpenFilesOptions) {}

  /**
   * Queue one path when it names an existing regular file.
   * @param path - candidate path from an operating-system open request.
   * @returns whether the path was queued.
   */
  enqueue(path: string): boolean {
    if (!isAbsolute(path)) return false
    const absolute = resolve(path)
    if (!this.options.isFile(absolute) || this.pending.includes(absolute)) return false
    this.pending.push(absolute)
    for (const listener of [...this.listeners]) listener()
    return true
  }

  /**
   * Queue file arguments from a launch command line, skipping option flags.
   * Callers pass arguments after the executable.
   * @param argv - launch arguments.
   * @returns how many paths were queued.
   */
  enqueueArguments(argv: readonly string[]): number {
    let queued = 0
    for (const argument of argv) {
      if (argument.startsWith('-') || !this.enqueue(argument)) continue
      queued += 1
    }
    return queued
  }

  /**
   * Take every queued path in arrival order.
   * @returns the drained absolute paths.
   */
  take(): string[] {
    return this.pending.splice(0, this.pending.length)
  }

  /**
   * Subscribe to the arrival signal.
   * @param listener - called after at least one path is queued.
   * @returns a disposer that removes this listener.
   */
  onAvailable(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}
