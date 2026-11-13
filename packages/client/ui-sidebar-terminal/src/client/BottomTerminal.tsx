/** Lazy bottom dock: xterm stays out of the startup client bundle. */
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import type { BottomTerminalProps } from './terminal.tsx'

const Loaded = lazy(async () => ({ default: (await import('./terminal.tsx')).BottomTerminal }))

/**
 * Render the bottom dock after its xterm-bearing chunk arrives.
 * @param props - root slot services, stores, and copy.
 * @returns the deferred dock.
 */
export function BottomTerminal(props: BottomTerminalProps): ReactNode {
  return <Suspense fallback={null}><Loaded {...props} /></Suspense>
}

export type { BottomTerminalInjected, BottomTerminalProps } from './terminal.tsx'
